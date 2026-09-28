/**
 * Authoritative Business Rules for Referral Commission & Community Tier Systems.
 * Specifications:
 * - Referral Levels: L1 (10%), L2 (3%), L3 (2%)
 * - L1 Eligibility: Personal staking >= $100 USD, Direct referral volume >= $100 USD
 * - L2 Eligibility: Active direct referrals >= 2, Team staking volume >= $500 USD, Personal staking >= $100 USD
 * - L3 Eligibility: Active direct referrals >= 3, Team staking volume >= $1,000 USD, Personal staking >= $100 USD
 *
 * Community Tiers (V1 to V6):
 * - V1: Personal >= 100 USDT, Team Volume >= 5,000 USDT, Differential Bonus = 10%
 * - V2: Personal >= 500 USDT, Team Volume >= 20,000 USDT, Differential Bonus = 20%
 * - V3: Personal >= 1,000 USDT, Team Volume >= 50,000 USDT, Differential Bonus = 30%
 * - V4: Personal >= 3,000 USDT, Team Volume >= 150,000 USDT, Differential Bonus = 35%
 * - V5: Personal >= 5,000 USDT, Team Volume >= 500,000 USDT, Differential Bonus = 45%
 * - V6: Personal >= 10,000 USDT, Team Volume >= 2,000,000 USDT, Differential Bonus = 55%
 */

export const ADS_PRICE_USD = 0.50; // 1 ADS = $0.50 USD

export const REFERRAL_RATES = {
  1: 0.10, // 10% L1 Direct
  2: 0.03, // 3% L2 Second-Level
  3: 0.02, // 2% L3 Third-Level
} as const;

export const REFERRAL_ELIGIBILITY = {
  1: {
    minPersonalStakingUsd: 100,
    minDirectReferralVolumeUsd: 100,
    minActiveDirectReferrals: 0,
    minTeamVolumeUsd: 0,
  },
  2: {
    minPersonalStakingUsd: 100,
    minDirectReferralVolumeUsd: 0,
    minActiveDirectReferrals: 2,
    minTeamVolumeUsd: 500,
  },
  3: {
    minPersonalStakingUsd: 100,
    minDirectReferralVolumeUsd: 0,
    minActiveDirectReferrals: 3,
    minTeamVolumeUsd: 1000,
  },
} as const;

export interface CommunityTierConfig {
  tier: "V0" | "V1" | "V2" | "V3" | "V4" | "V5" | "V6";
  minPersonalStakingUsdt: number;
  minTeamVolumeUsdt: number;
  bonusPercentage: number;
}

export const COMMUNITY_TIER_CONFIGS: CommunityTierConfig[] = [
  { tier: "V0", minPersonalStakingUsdt: 0, minTeamVolumeUsdt: 0, bonusPercentage: 0 },
  { tier: "V1", minPersonalStakingUsdt: 100, minTeamVolumeUsdt: 5000, bonusPercentage: 10 },
  { tier: "V2", minPersonalStakingUsdt: 500, minTeamVolumeUsdt: 20000, bonusPercentage: 20 },
  { tier: "V3", minPersonalStakingUsdt: 1000, minTeamVolumeUsdt: 50000, bonusPercentage: 30 },
  { tier: "V4", minPersonalStakingUsdt: 3000, minTeamVolumeUsdt: 150000, bonusPercentage: 35 },
  { tier: "V5", minPersonalStakingUsdt: 5000, minTeamVolumeUsdt: 500000, bonusPercentage: 45 },
  { tier: "V6", minPersonalStakingUsdt: 10000, minTeamVolumeUsdt: 2000000, bonusPercentage: 55 },
];

/**
 * Definition of Active Referral:
 * A referral is active if they have non-zero active staking amount in USDT or ADS.
 */
export function isUserActiveReferral(user: { totalStakedUsdt: number; totalStakedAds: number }): boolean {
  if (!user) return false;
  const totalUsd = user.totalStakedUsdt + user.totalStakedAds * ADS_PRICE_USD;
  return totalUsd >= 10; // At least minimum deposit of 10 USDT
}

/**
 * Calculates user personal staking amount in USD.
 */
export function getPersonalStakingUsd(user: { totalStakedUsdt: number; totalStakedAds: number }): number {
  if (!user) return 0;
  return roundFinancial(user.totalStakedUsdt + user.totalStakedAds * ADS_PRICE_USD);
}

/**
 * Rounding helper for financial calculations: rounds to 6 decimal places to prevent float drift,
 * with optional display rounding.
 */
export function roundFinancial(amount: number, decimals: number = 6): number {
  const factor = Math.pow(10, decimals);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

export function formatCurrency(amount: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}
