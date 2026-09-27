import { db } from "./db.service";
import { User, DifferentialBonusRecord } from "../types";
import { ReferralService } from "./referral.service";

export interface TierConfig {
  tier: "V0" | "V1" | "V2" | "V3" | "V4" | "V5" | "V6";
  minPersonalStaking: number;
  minWeakLegVolume: number;
  bonusPercentage: number;
}

export const TIER_CONFIGS: TierConfig[] = [
  { tier: "V0", minPersonalStaking: 0, minWeakLegVolume: 0, bonusPercentage: 0 },
  { tier: "V1", minPersonalStaking: 100, minWeakLegVolume: 5000, bonusPercentage: 10 },
  { tier: "V2", minPersonalStaking: 500, minWeakLegVolume: 20000, bonusPercentage: 20 },
  { tier: "V3", minPersonalStaking: 1000, minWeakLegVolume: 50000, bonusPercentage: 30 },
  { tier: "V4", minPersonalStaking: 3000, minWeakLegVolume: 150000, bonusPercentage: 35 },
  { tier: "V5", minPersonalStaking: 5000, minWeakLegVolume: 500000, bonusPercentage: 45 },
  { tier: "V6", minPersonalStaking: 10000, minWeakLegVolume: 2000000, bonusPercentage: 55 },
];

export class TierService {
  /**
   * Calculates strong-leg and weak-leg team volume for a user.
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
      const directStats = ReferralService.getTeamStats(direct.address);
      const branchTotal =
        direct.totalStakedUsdt +
        direct.totalStakedAds * 0.50 +
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
   * Evaluates and updates the Community Tier (V1-V6) for a user based on personal staking and weak leg.
   */
  public static evaluateUserTier(userAddress: string): TierConfig {
    const user = db.getUser(userAddress);
    if (!user) return TIER_CONFIGS[0];

    const personalStaking = user.totalStakedUsdt + user.totalStakedAds * 0.50;
    const { weakLegVolume } = this.calculateLegVolumes(userAddress);

    let eligibleTier = TIER_CONFIGS[0];

    // Iterate backwards from V6 to V1
    for (let i = TIER_CONFIGS.length - 1; i >= 1; i--) {
      const cfg = TIER_CONFIGS[i];
      if (personalStaking >= cfg.minPersonalStaking && weakLegVolume >= cfg.minWeakLegVolume) {
        eligibleTier = cfg;
        break;
      }
    }

    if (user.communityTier !== eligibleTier.tier) {
      user.communityTier = eligibleTier.tier;
      db.updateUser(user);
    }

    return eligibleTier;
  }

  public static getTierPercentage(tier: string): number {
    const cfg = TIER_CONFIGS.find((t) => t.tier === tier);
    return cfg ? cfg.bonusPercentage : 0;
  }

  /**
   * Calculates differential bonus:
   * Differential Bonus = Eligible Team Volume * (Your Tier % - Downline's Tier %)
   */
  public static processDifferentialBonus(
    sponsorAddress: string,
    downlineAddress: string,
    eligibleVolume: number
  ): DifferentialBonusRecord | null {
    const sponsor = db.getUser(sponsorAddress);
    const downline = db.getUser(downlineAddress);
    if (!sponsor || !downline) return null;

    const sponsorTierCfg = this.evaluateUserTier(sponsor.address);
    const downlineTierCfg = this.evaluateUserTier(downline.address);

    const diffRate = sponsorTierCfg.bonusPercentage - downlineTierCfg.bonusPercentage;
    if (diffRate <= 0) return null; // No overriding bonus if downline is at same or higher tier

    const bonusAmount = (eligibleVolume * diffRate) / 100;

    const record: DifferentialBonusRecord = {
      id: "diff_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      recipientAddress: sponsor.address,
      downlineAddress: downline.address,
      recipientTier: sponsorTierCfg.tier,
      downlineTier: downlineTierCfg.tier,
      differentialRate: diffRate,
      eligibleVolume,
      bonusAmount,
      timestamp: Date.now(),
    };

    db.addDifferentialBonus(record);

    // Credit differential bonus virtually in ADS
    sponsor.pendingAdsRewards += bonusAmount;
    db.updateUser(sponsor);

    return record;
  }
}
