/**
 * CENTRALIZED BUSINESS RULES CONFIGURATION
 * ==========================================
 * All financial rules, commission rates, eligibility thresholds,
 * and tier configurations are defined here.
 * NEVER scatter these values across other files.
 *
 * UNRESOLVED RULES (require product owner confirmation):
 * 1. "Active referral" definition: currently = user has totalStakedUsdt > 0 OR totalStakedAds > 0
 *    (a non-zero stake). Registered-only users without stake are NOT active.
 * 2. Team volume includes L1+L2+L3 only (3-level deep), not unlimited depth.
 * 3. Volume calculated on principal staked (USDT + ADS*$0.50). NOT on daily rewards.
 * 4. Tier bonus eligible volume = total team staking volume (same 3-level calculation).
 * 5. Tier bonuses are credited once per daily cron run (not per-stake event).
 * 6. Tier qualification uses totalTeamVolume (all 3 legs), not weak-leg-only.
 *    NOTE: The existing tier.service.ts uses weak-leg for tier qualification.
 *    This is preserved as existing documented behavior.
 * 7. ADS token price is fixed at $0.50 USDT for all calculations.
 * 8. Rounding: all monetary results rounded to 8 decimal places at final output.
 */

// ─── REFERRAL COMMISSION RATES ────────────────────────────────────────────────
export const REFERRAL_RATES = {
  L1: 0.10, // 10% of referred user's eligible daily staking reward
  L2: 0.03, // 3%
  L3: 0.02, // 2%
} as const;

// ─── REFERRAL COMMISSION ELIGIBILITY REQUIREMENTS ─────────────────────────────
export const REFERRAL_ELIGIBILITY = {
  L1: {
    minPersonalStakingUsdt: 100,  // sponsor's personal staking >= $100
    minDirectReferralVolumeUsdt: 100, // sponsor's direct referral volume >= $100
  },
  L2: {
    minActiveDirectReferrals: 2,  // sponsor must have >= 2 active direct referrals
    minTeamVolumeUsdt: 500,       // team staking volume >= $500
  },
  L3: {
    minActiveDirectReferrals: 3,  // sponsor must have >= 3 active direct referrals
    minTeamVolumeUsdt: 1000,      // team staking volume >= $1,000
  },
} as const;

// ─── ACTIVE REFERRAL DEFINITION ───────────────────────────────────────────────
/**
 * An "active" referral is a user who has at least one non-zero stake
 * (either USDT staked > 0 OR ADS staked > 0).
 * Registered-only users with no stake are NOT active referrals.
 *
 * UNRESOLVED: Product owner must confirm whether "active" also requires
 * the stake to still be in ACTIVE status (not COMPLETED/WITHDRAWN).
 * Current implementation: any non-zero totalStakedAds or totalStakedUsdt.
 */
export function isActiveReferral(user: { totalStakedAds: number; totalStakedUsdt: number }): boolean {
  return user.totalStakedAds > 0 || user.totalStakedUsdt > 0;
}

// ─── ADS TOKEN PRICE ──────────────────────────────────────────────────────────
export const ADS_PRICE_USDT = 0.50; // $0.50 per ADS token (fixed for v2.0)

// ─── USDT EQUIVALENT CALCULATION ──────────────────────────────────────────────
export function toUsdtEquivalent(totalStakedAds: number, totalStakedUsdt: number): number {
  return totalStakedUsdt + totalStakedAds * ADS_PRICE_USDT;
}

// ─── COMMUNITY TIER CONFIGURATION (V1–V6) ─────────────────────────────────────
export interface TierConfig {
  tier: "V0" | "V1" | "V2" | "V3" | "V4" | "V5" | "V6";
  minPersonalStaking: number;   // USDT equivalent
  minTeamVolume: number;        // USDT equivalent (total team staking volume)
  bonusPercentage: number;      // differential bonus rate %
}

export const TIER_CONFIGS: TierConfig[] = [
  { tier: "V0", minPersonalStaking: 0,     minTeamVolume: 0,         bonusPercentage: 0  },
  { tier: "V1", minPersonalStaking: 100,   minTeamVolume: 5000,      bonusPercentage: 10 },
  { tier: "V2", minPersonalStaking: 500,   minTeamVolume: 20000,     bonusPercentage: 20 },
  { tier: "V3", minPersonalStaking: 1000,  minTeamVolume: 50000,     bonusPercentage: 30 },
  { tier: "V4", minPersonalStaking: 3000,  minTeamVolume: 150000,    bonusPercentage: 35 },
  { tier: "V5", minPersonalStaking: 5000,  minTeamVolume: 500000,    bonusPercentage: 45 },
  { tier: "V6", minPersonalStaking: 10000, minTeamVolume: 2000000,   bonusPercentage: 55 },
];

export function getTierConfig(tier: string): TierConfig {
  return TIER_CONFIGS.find((t) => t.tier === tier) ?? TIER_CONFIGS[0];
}

export function getTierBonusPercentage(tier: string): number {
  return getTierConfig(tier).bonusPercentage;
}

/**
 * Determines the highest qualifying tier for a user.
 * BOTH personal staking AND team volume must meet the requirement.
 */
export function evaluateTier(
  personalStakingUsdt: number,
  teamVolumeUsdt: number
): TierConfig {
  // Iterate from highest tier downward
  for (let i = TIER_CONFIGS.length - 1; i >= 1; i--) {
    const cfg = TIER_CONFIGS[i];
    if (personalStakingUsdt >= cfg.minPersonalStaking && teamVolumeUsdt >= cfg.minTeamVolume) {
      return cfg;
    }
  }
  return TIER_CONFIGS[0]; // V0 = no tier
}

// ─── IDEMPOTENCY KEY GENERATION ───────────────────────────────────────────────
/**
 * Generates a stable idempotency key for a referral commission record.
 * Same inputs always produce the same key, preventing duplicate processing.
 */
export function makeReferralCommissionKey(
  earnerAddress: string,
  sponsorAddress: string,
  level: 1 | 2 | 3,
  cronRunId: string
): string {
  return `refcomm_${earnerAddress.toLowerCase()}_to_${sponsorAddress.toLowerCase()}_L${level}_${cronRunId}`;
}

/**
 * Generates a stable idempotency key for a differential bonus record.
 */
export function makeDiffBonusKey(
  sponsorAddress: string,
  downlineAddress: string,
  cronRunId: string
): string {
  return `diffbonus_${sponsorAddress.toLowerCase()}_from_${downlineAddress.toLowerCase()}_${cronRunId}`;
}
