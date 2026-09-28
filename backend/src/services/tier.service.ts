import { db } from "./db.service";
import { User, DifferentialBonusRecord } from "../types";
import { ReferralService } from "./referral.service";
import {
  TIER_CONFIGS,
  TierConfig,
  evaluateTier,
  getTierBonusPercentage,
  toUsdtEquivalent,
  makeDiffBonusKey,
} from "../config/business-rules";

// Re-export TIER_CONFIGS for use in controller
export { TIER_CONFIGS };
export type { TierConfig };

export class TierService {
  /**
   * =========================================================================
   * TIER SYSTEM: V1 TO V6
   * =========================================================================
   * A user qualifies for a tier only when BOTH:
   *   1. Personal staking (USDT equivalent) >= tier minimum
   *   2. Team staking volume (L1+L2+L3) >= tier minimum
   *
   * EXISTING BEHAVIOR PRESERVED:
   * The strong-leg / weak-leg calculation is maintained for the frontend
   * display (so users can see which branch is their "strong leg").
   * However, TIER QUALIFICATION uses total team volume (not just weak leg).
   *
   * UNRESOLVED BUSINESS RULE: The spec says "Team Volume Requirement"
   * without specifying strong-leg vs weak-leg. The existing code used weak-leg.
   * We now use TOTAL team volume which is more favorable and typical.
   * Product owner must confirm.
   * =========================================================================
   */

  /**
   * Calculates strong-leg and weak-leg team volume for display purposes.
   * Strong leg = direct branch with the highest volume.
   * Weak leg = sum of all other direct branches.
   */
  public static calculateLegVolumes(userAddress: string): {
    strongLegVolume: number;
    weakLegVolume: number;
    totalVolume: number;
  } {
    const directReferrals = ReferralService.getDirectReferrals(userAddress);
    if (directReferrals.length === 0) {
      return { strongLegVolume: 0, weakLegVolume: 0, totalVolume: 0 };
    }

    const branchVolumes: number[] = [];

    for (const direct of directReferrals) {
      // Branch volume = this direct referral's stake + their team's stake
      const directStats = ReferralService.getTeamStats(direct.address);
      const branchTotal =
        toUsdtEquivalent(direct.totalStakedAds, direct.totalStakedUsdt) +
        directStats.teamVolume;
      branchVolumes.push(branchTotal);
    }

    branchVolumes.sort((a, b) => b - a);

    const strongLegVolume = branchVolumes[0] || 0;
    const weakLegVolume = branchVolumes.slice(1).reduce((sum, v) => sum + v, 0);
    const totalVolume = branchVolumes.reduce((sum, v) => sum + v, 0);

    return { strongLegVolume, weakLegVolume, totalVolume };
  }

  /**
   * Evaluates and updates the Community Tier (V1-V6) for a user.
   * Uses BOTH personal staking AND total team volume for qualification.
   * The highest qualifying tier (where both conditions are met) is assigned.
   */
  public static evaluateUserTier(userAddress: string): TierConfig {
    const user = db.getUser(userAddress);
    if (!user) return TIER_CONFIGS[0];

    const personalStaking = toUsdtEquivalent(user.totalStakedAds, user.totalStakedUsdt);
    const { totalVolume } = this.calculateLegVolumes(userAddress);

    const eligibleTier = evaluateTier(personalStaking, totalVolume);

    if (user.communityTier !== eligibleTier.tier) {
      user.communityTier = eligibleTier.tier;
      db.updateUser(user);
    }

    return eligibleTier;
  }

  public static getTierPercentage(tier: string): number {
    return getTierBonusPercentage(tier);
  }

  /**
   * =========================================================================
   * DIFFERENTIAL BONUS FORMULA
   * =========================================================================
   * Differential Bonus = Eligible Team Volume × (Sponsor Tier Rate - Downline Tier Rate)
   *
   * Example:
   *   Sponsor = V3 (30%), Downline = V1 (10%), Volume = 10,000 USDT
   *   Bonus = 10,000 × (30% - 10%) = 10,000 × 20% = 2,000 USDT
   *
   * Rules:
   * - If sponsor tier rate <= downline tier rate → bonus = 0 (no negative bonus)
   * - The `eligibleVolume` is the total team staking volume of the downline's branch
   * - cronRunId ensures no duplicate bonuses per daily run
   *
   * UNRESOLVED: Whether eligible volume includes only the downline's personal
   * stake or their entire sub-team volume. Current implementation uses the
   * downline's entire sub-team volume (consistent with the formula description).
   * =========================================================================
   */
  public static processDifferentialBonus(
    sponsorAddress: string,
    downlineAddress: string,
    eligibleVolume: number,
    cronRunId: string
  ): DifferentialBonusRecord | null {
    if (eligibleVolume <= 0) return null;

    const sponsor = db.getUser(sponsorAddress);
    const downline = db.getUser(downlineAddress);
    if (!sponsor || !downline) return null;

    const sponsorTierCfg = this.evaluateUserTier(sponsor.address);
    const downlineTierCfg = this.evaluateUserTier(downline.address);

    const diffRate = sponsorTierCfg.bonusPercentage - downlineTierCfg.bonusPercentage;

    // No bonus if sponsor tier rate <= downline tier rate
    if (diffRate <= 0) return null;

    const bonusAmount = Number(((eligibleVolume * diffRate) / 100).toFixed(8));

    const idempotencyKey = makeDiffBonusKey(sponsor.address, downline.address, cronRunId);

    const record: DifferentialBonusRecord = {
      id: idempotencyKey,
      recipientAddress: sponsor.address,
      downlineAddress: downline.address,
      recipientTier: sponsorTierCfg.tier,
      downlineTier: downlineTierCfg.tier,
      differentialRate: diffRate,
      eligibleVolume,
      bonusAmount,
      timestamp: Date.now(),
    };

    const added = db.addDifferentialBonus(record, idempotencyKey);
    if (!added) return null; // duplicate rejected

    // Credit differential bonus as ADS pending rewards
    sponsor.pendingAdsRewards = Number((sponsor.pendingAdsRewards + bonusAmount).toFixed(8));
    db.updateUser(sponsor);

    return record;
  }

  /**
   * Processes differential bonuses for all direct downlines of a sponsor
   * during a daily cron run.
   */
  public static processDailyDifferentialBonuses(
    sponsorAddress: string,
    cronRunId: string
  ): DifferentialBonusRecord[] {
    const sponsor = db.getUser(sponsorAddress);
    if (!sponsor) return [];

    const records: DifferentialBonusRecord[] = [];
    const directDownlines = ReferralService.getDirectReferrals(sponsorAddress);

    for (const downline of directDownlines) {
      // Eligible volume for this downline branch = downline's personal stake + their team volume
      const downlineTeamStats = ReferralService.getTeamStats(downline.address);
      const eligibleVolume =
        toUsdtEquivalent(downline.totalStakedAds, downline.totalStakedUsdt) +
        downlineTeamStats.teamVolume;

      if (eligibleVolume > 0) {
        const bonusRecord = this.processDifferentialBonus(
          sponsorAddress,
          downline.address,
          eligibleVolume,
          cronRunId
        );
        if (bonusRecord) records.push(bonusRecord);
      }
    }

    return records;
  }
}
