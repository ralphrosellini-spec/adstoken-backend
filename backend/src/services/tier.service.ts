import { db } from "./db.service";
import { DifferentialBonusRecord } from "../types";
import { ReferralService } from "./referral.service";
import {
  COMMUNITY_TIER_CONFIGS,
  CommunityTierConfig,
  getPersonalStakingUsd,
  roundFinancial,
} from "../config/business-rules";

export { COMMUNITY_TIER_CONFIGS, CommunityTierConfig };
export const TIER_CONFIGS = COMMUNITY_TIER_CONFIGS;

export class TierService {
  /**
   * Calculates strong-leg and weak-leg team volume for a user, as well as total team volume.
   * Total team volume is calculated authoritatively using unique team downlines.
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
      const directPersonal = getPersonalStakingUsd(direct);
      const branchTotal = roundFinancial(directPersonal + directStats.teamVolume, 2);
      branchVolumes.push(branchTotal);
    }

    branchVolumes.sort((a, b) => b - a);

    const strongLegVolume = branchVolumes[0] || 0;
    const weakLegVolume = roundFinancial(
      branchVolumes.slice(1).reduce((sum, v) => sum + v, 0),
      2
    );
    const totalVolume = roundFinancial(
      branchVolumes.reduce((sum, v) => sum + v, 0),
      2
    );

    return { strongLegVolume, weakLegVolume, totalVolume };
  }

  /**
   * Evaluates and updates the Community Tier (V1-V6) for a user based on:
   * 1. Personal Staking Requirement (USDT/USD)
   * 2. Total Team Staking Volume (USDT/USD)
   * Both conditions must be satisfied.
   */
  public static evaluateUserTier(userAddress: string): CommunityTierConfig {
    const user = db.getUser(userAddress);
    if (!user) return COMMUNITY_TIER_CONFIGS[0];

    const personalStaking = getPersonalStakingUsd(user);
    const { totalVolume } = this.calculateLegVolumes(userAddress);

    let eligibleTier = COMMUNITY_TIER_CONFIGS[0]; // V0

    // Iterate backwards from V6 down to V1
    for (let i = COMMUNITY_TIER_CONFIGS.length - 1; i >= 1; i--) {
      const cfg = COMMUNITY_TIER_CONFIGS[i];
      if (
        personalStaking >= cfg.minPersonalStakingUsdt &&
        totalVolume >= cfg.minTeamVolumeUsdt
      ) {
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
    const cfg = COMMUNITY_TIER_CONFIGS.find((t) => t.tier === tier);
    return cfg ? cfg.bonusPercentage : 0;
  }

  /**
   * Calculates next tier requirements and progress for a user.
   */
  public static getNextTierInfo(userAddress: string) {
    const currentTierCfg = this.evaluateUserTier(userAddress);
    const user = db.getUser(userAddress);
    const personalStaking = user ? getPersonalStakingUsd(user) : 0;
    const { totalVolume, strongLegVolume, weakLegVolume } = this.calculateLegVolumes(userAddress);

    const currentIndex = COMMUNITY_TIER_CONFIGS.findIndex((t) => t.tier === currentTierCfg.tier);
    const nextTierCfg =
      currentIndex < COMMUNITY_TIER_CONFIGS.length - 1
        ? COMMUNITY_TIER_CONFIGS[currentIndex + 1]
        : null;

    let personalRequired = 0;
    let teamVolumeRequired = 0;
    let personalProgress = 100;
    let teamProgress = 100;

    if (nextTierCfg) {
      personalRequired = Math.max(0, nextTierCfg.minPersonalStakingUsdt - personalStaking);
      teamVolumeRequired = Math.max(0, nextTierCfg.minTeamVolumeUsdt - totalVolume);

      personalProgress = Math.min(
        100,
        nextTierCfg.minPersonalStakingUsdt > 0
          ? roundFinancial((personalStaking / nextTierCfg.minPersonalStakingUsdt) * 100, 1)
          : 100
      );
      teamProgress = Math.min(
        100,
        nextTierCfg.minTeamVolumeUsdt > 0
          ? roundFinancial((totalVolume / nextTierCfg.minTeamVolumeUsdt) * 100, 1)
          : 100
      );
    }

    return {
      currentTier: currentTierCfg.tier,
      currentTierRate: currentTierCfg.bonusPercentage,
      nextTier: nextTierCfg ? nextTierCfg.tier : null,
      nextTierRate: nextTierCfg ? nextTierCfg.bonusPercentage : null,
      personalStaking,
      teamVolume: totalVolume,
      strongLegVolume,
      weakLegVolume,
      personalRequired,
      teamVolumeRequired,
      personalProgress,
      teamProgress,
    };
  }

  /**
   * Calculates differential bonus for a specific sponsor-downline pair:
   * Differential Bonus = Eligible Team Volume * (Your Tier % - Downline's Tier %)
   * Never produces a negative bonus.
   */
  public static processDifferentialBonus(
    sponsorAddress: string,
    downlineAddress: string,
    eligibleVolume: number,
    eventId?: string
  ): DifferentialBonusRecord | null {
    if (eligibleVolume <= 0) return null;

    const sponsor = db.getUser(sponsorAddress);
    const downline = db.getUser(downlineAddress);
    if (!sponsor || !downline) return null;

    const sponsorTierCfg = this.evaluateUserTier(sponsor.address);
    const downlineTierCfg = this.evaluateUserTier(downline.address);

    const diffRate = sponsorTierCfg.bonusPercentage - downlineTierCfg.bonusPercentage;
    if (diffRate <= 0) return null; // Formula never produces a negative bonus

    const bonusAmount = roundFinancial((eligibleVolume * diffRate) / 100, 6);
    if (bonusAmount <= 0) return null;

    const baseEventId = eventId || `diff_ev_${Date.now()}`;
    const idempotencyKey = `diff_${baseEventId}_${sponsor.address.toLowerCase()}_${downline.address.toLowerCase()}`;

    const record: DifferentialBonusRecord = {
      id: idempotencyKey,
      recipientAddress: sponsor.address.toLowerCase(),
      downlineAddress: downline.address.toLowerCase(),
      recipientTier: sponsorTierCfg.tier,
      downlineTier: downlineTierCfg.tier,
      differentialRate: diffRate,
      eligibleVolume: roundFinancial(eligibleVolume, 4),
      bonusAmount,
      timestamp: Date.now(),
      eventId: baseEventId,
      token: "ADS",
    };

    const added = db.addDifferentialBonus(record);
    if (added) {
      sponsor.pendingAdsRewards = roundFinancial(sponsor.pendingAdsRewards + bonusAmount, 4);
      db.updateUser(sponsor);
      return record;
    }

    return null;
  }

  /**
   * Distributes differential bonuses along the upline chain for an eligible volume/reward event.
   * Walks up ancestors: Each upline gets (theirTierRate - maxSubTierRate) on the volume.
   */
  public static distributeDifferentialBonusesForReward(
    earnerAddress: string,
    eligibleRewardAmount: number,
    eventId: string
  ): DifferentialBonusRecord[] {
    if (eligibleRewardAmount <= 0) return [];

    const earner = db.getUser(earnerAddress);
    if (!earner) return [];

    const earnerTier = this.evaluateUserTier(earner.address);
    let maxSubTierRate = earnerTier.bonusPercentage;

    const createdRecords: DifferentialBonusRecord[] = [];
    let currentAddress: string | null = earner.referrerAddress;
    const visited = new Set<string>([earner.address.toLowerCase()]);

    while (currentAddress) {
      const uplineNorm = currentAddress.toLowerCase();
      if (visited.has(uplineNorm)) break; // Cycle prevention
      visited.add(uplineNorm);

      const uplineUser = db.getUser(uplineNorm);
      if (!uplineUser) break;

      const uplineTier = this.evaluateUserTier(uplineUser.address);

      if (uplineTier.bonusPercentage > maxSubTierRate) {
        const diffRate = uplineTier.bonusPercentage - maxSubTierRate;
        const bonusAmount = roundFinancial((eligibleRewardAmount * diffRate) / 100, 6);

        if (bonusAmount > 0) {
          const idempotencyKey = `diff_${eventId}_${uplineUser.address.toLowerCase()}_${earnerAddress.toLowerCase()}`;
          const record: DifferentialBonusRecord = {
            id: idempotencyKey,
            recipientAddress: uplineUser.address.toLowerCase(),
            downlineAddress: earnerAddress.toLowerCase(),
            recipientTier: uplineTier.tier,
            downlineTier: earnerTier.tier,
            differentialRate: diffRate,
            eligibleVolume: roundFinancial(eligibleRewardAmount, 4),
            bonusAmount,
            timestamp: Date.now(),
            eventId,
            token: "ADS",
          };

          const added = db.addDifferentialBonus(record);
          if (added) {
            uplineUser.pendingAdsRewards = roundFinancial(
              uplineUser.pendingAdsRewards + bonusAmount,
              4
            );
            db.updateUser(uplineUser);
            createdRecords.push(record);
          }
        }

        maxSubTierRate = uplineTier.bonusPercentage;
        if (maxSubTierRate >= 55) {
          // V6 reached, highest possible rate in system
          break;
        }
      }

      currentAddress = uplineUser.referrerAddress;
    }

    return createdRecords;
  }
}
