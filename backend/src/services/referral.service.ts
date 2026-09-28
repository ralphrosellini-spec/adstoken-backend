import { db } from "./db.service";
import { User, ReferralCommissionRecord } from "../types";
import { StakingService } from "./staking.service";
import {
  REFERRAL_RATES,
  REFERRAL_ELIGIBILITY,
  isActiveReferral,
  toUsdtEquivalent,
  makeReferralCommissionKey,
} from "../config/business-rules";

export class ReferralService {
  /**
   * =========================================================================
   * REFERRAL LEVEL TERMINOLOGY (IMPORTANT - DO NOT CHANGE)
   * =========================================================================
   * L1, L2, L3 are distances from a SPONSOR to their downlines.
   * They are NOT permanent user labels.
   *
   * Given sponsor S:
   *   S -> A -> B -> C
   *   A = L1 (direct referral of S)
   *   B = L2 (A's direct referral, S's 2nd-level)
   *   C = L3 (B's direct referral, S's 3rd-level)
   *
   * The SAME user A can be:
   *   - L1 relative to S
   *   - L2 relative to S's sponsor
   *   - L3 relative to S's sponsor's sponsor
   *
   * getUpline(earnerAddress) returns the 3 sponsors ABOVE the earner:
   *   l1 = earner's direct sponsor (receives 10% commission on earner's reward)
   *   l2 = earner's sponsor's sponsor (receives 3%)
   *   l3 = earner's sponsor's sponsor's sponsor (receives 2%)
   * =========================================================================
   */

  /**
   * Builds the 3-level upline chain for a user (the sponsors above them).
   * earnerAddress -> l1 -> l2 -> l3
   *
   * Usage: when earner generates a daily reward, pass their address here.
   * l1 is their direct sponsor, l2 is l1's sponsor, l3 is l2's sponsor.
   */
  public static getUpline(earnerAddress: string): {
    l1: User | null;
    l2: User | null;
    l3: User | null;
  } {
    const user = db.getUser(earnerAddress);
    if (!user || !user.referrerAddress) {
      return { l1: null, l2: null, l3: null };
    }

    const l1 = db.getUser(user.referrerAddress) || null;
    let l2: User | null = null;
    let l3: User | null = null;

    if (l1 && l1.referrerAddress) {
      l2 = db.getUser(l1.referrerAddress) || null;
      if (l2 && l2.referrerAddress) {
        l3 = db.getUser(l2.referrerAddress) || null;
      }
    }

    return { l1, l2, l3 };
  }

  /**
   * Helper to get upline ancestors for an address to prevent any ancestor
   * from ever being misclassified as a downline.
   */
  public static getAncestors(address: string): Set<string> {
    const ancestors = new Set<string>();
    let curr = db.getUser(address)?.referrerAddress;
    while (curr) {
      const lower = curr.toLowerCase();
      if (ancestors.has(lower)) break;
      ancestors.add(lower);
      curr = db.getUser(lower)?.referrerAddress;
    }
    return ancestors;
  }

  /**
   * Gets the direct referrals (L1 downlines) of a sponsor.
   * Distance = 1 from sponsor.
   */
  public static getDirectReferrals(sponsorAddress: string): User[] {
    const normalized = sponsorAddress.toLowerCase();
    const ancestors = this.getAncestors(normalized);
    return db.getAllUsers().filter((u) => {
      const addr = u.address.toLowerCase();
      return (
        addr !== normalized &&
        !ancestors.has(addr) &&
        u.referrerAddress?.toLowerCase() === normalized
      );
    });
  }

  /**
   * Gets all L2 downlines of a sponsor (Distance = 2).
   * Direct referrals of L1 users, strictly excluding sponsor, ancestors, and L1 users.
   */
  public static getL2Referrals(sponsorAddress: string): User[] {
    const normalized = sponsorAddress.toLowerCase();
    const ancestors = this.getAncestors(normalized);
    const l1Users = this.getDirectReferrals(sponsorAddress);
    const l1Set = new Set(l1Users.map((u) => u.address.toLowerCase()));

    return db.getAllUsers().filter((u) => {
      const addr = u.address.toLowerCase();
      const ref = u.referrerAddress?.toLowerCase();
      return (
        addr !== normalized &&
        !ancestors.has(addr) &&
        !l1Set.has(addr) &&
        ref &&
        l1Set.has(ref)
      );
    });
  }

  /**
   * Gets all L3 downlines of a sponsor (Distance = 3).
   * Direct referrals of L2 users, strictly excluding sponsor, ancestors, L1 users, and L2 users.
   */
  public static getL3Referrals(sponsorAddress: string): User[] {
    const normalized = sponsorAddress.toLowerCase();
    const ancestors = this.getAncestors(normalized);
    const l1Users = this.getDirectReferrals(sponsorAddress);
    const l1Set = new Set(l1Users.map((u) => u.address.toLowerCase()));
    const l2Users = this.getL2Referrals(sponsorAddress);
    const l2Set = new Set(l2Users.map((u) => u.address.toLowerCase()));

    return db.getAllUsers().filter((u) => {
      const addr = u.address.toLowerCase();
      const ref = u.referrerAddress?.toLowerCase();
      return (
        addr !== normalized &&
        !ancestors.has(addr) &&
        !l1Set.has(addr) &&
        !l2Set.has(addr) &&
        ref &&
        l2Set.has(ref)
      );
    });
  }

  /**
   * Returns what level (1, 2, or 3) a given user is relative to a sponsor.
   * Returns null if no relationship exists within 3 levels.
   */
  public static getReferralLevel(
    sponsorAddress: string,
    userAddress: string
  ): 1 | 2 | 3 | null {
    const normalized = userAddress.toLowerCase();
    const l1Users = this.getDirectReferrals(sponsorAddress);
    if (l1Users.some((u) => u.address.toLowerCase() === normalized)) return 1;

    const l2Users = this.getL2Referrals(sponsorAddress);
    if (l2Users.some((u) => u.address.toLowerCase() === normalized)) return 2;

    const l3Users = this.getL3Referrals(sponsorAddress);
    if (l3Users.some((u) => u.address.toLowerCase() === normalized)) return 3;

    return null;
  }

  /**
   * Calculates team staking volume and stats for a sponsor (3 levels deep).
   * NOTE: Team volume = L1 + L2 + L3 staking principal (not rewards).
   * Personal staking of the sponsor is NOT included in team volume.
   */
  public static getTeamStats(sponsorAddress: string) {
    const directReferrals = this.getDirectReferrals(sponsorAddress);
    const l2Users = this.getL2Referrals(sponsorAddress);
    const l3Users = this.getL3Referrals(sponsorAddress);

    let directVolume = 0;
    let teamVolume = 0;
    const teamAddresses = new Set<string>();
    let activeDirectCount = 0;

    // L1 volume
    for (const u of directReferrals) {
      const vol = toUsdtEquivalent(u.totalStakedAds, u.totalStakedUsdt);
      directVolume += vol;
      teamVolume += vol;
      teamAddresses.add(u.address.toLowerCase());
      if (isActiveReferral(u)) activeDirectCount++;
    }

    // L2 volume
    for (const u of l2Users) {
      const vol = toUsdtEquivalent(u.totalStakedAds, u.totalStakedUsdt);
      teamVolume += vol;
      teamAddresses.add(u.address.toLowerCase());
    }

    // L3 volume
    for (const u of l3Users) {
      const vol = toUsdtEquivalent(u.totalStakedAds, u.totalStakedUsdt);
      teamVolume += vol;
      teamAddresses.add(u.address.toLowerCase());
    }

    return {
      directReferralsCount: directReferrals.length,
      activeDirectReferralsCount: activeDirectCount,
      directVolume,
      l2Count: l2Users.length,
      l3Count: l3Users.length,
      totalTeamCount: teamAddresses.size,
      teamVolume,
    };
  }

  /**
   * Checks whether a sponsor is eligible for a given commission level.
   *
   * L1 eligibility:
   *   - Sponsor personal staking >= $100 USDT equivalent
   *   - Sponsor direct referral volume >= $100 USDT equivalent
   *
   * L2 eligibility:
   *   - Sponsor has >= 2 active direct referrals
   *   - Team staking volume >= $500 USDT equivalent
   *
   * L3 eligibility:
   *   - Sponsor has >= 3 active direct referrals
   *   - Team staking volume >= $1,000 USDT equivalent
   */
  public static checkSponsorEligibility(
    sponsor: User,
    level: 1 | 2 | 3
  ): { eligible: boolean; reason?: string } {
    const teamStats = this.getTeamStats(sponsor.address);
    const personalStake = toUsdtEquivalent(sponsor.totalStakedAds, sponsor.totalStakedUsdt);

    if (level === 1) {
      const { minPersonalStakingUsdt, minDirectReferralVolumeUsdt } = REFERRAL_ELIGIBILITY.L1;
      if (personalStake < minPersonalStakingUsdt) {
        return {
          eligible: false,
          reason: `L1: personal staking $${personalStake.toFixed(2)} < required $${minPersonalStakingUsdt}`,
        };
      }
      if (teamStats.directVolume < minDirectReferralVolumeUsdt) {
        return {
          eligible: false,
          reason: `L1: direct referral volume $${teamStats.directVolume.toFixed(2)} < required $${minDirectReferralVolumeUsdt}`,
        };
      }
      return { eligible: true };
    }

    if (level === 2) {
      const { minActiveDirectReferrals, minTeamVolumeUsdt } = REFERRAL_ELIGIBILITY.L2;
      if (teamStats.activeDirectReferralsCount < minActiveDirectReferrals) {
        return {
          eligible: false,
          reason: `L2: active direct referrals ${teamStats.activeDirectReferralsCount} < required ${minActiveDirectReferrals}`,
        };
      }
      if (teamStats.teamVolume < minTeamVolumeUsdt) {
        return {
          eligible: false,
          reason: `L2: team volume $${teamStats.teamVolume.toFixed(2)} < required $${minTeamVolumeUsdt}`,
        };
      }
      return { eligible: true };
    }

    if (level === 3) {
      const { minActiveDirectReferrals, minTeamVolumeUsdt } = REFERRAL_ELIGIBILITY.L3;
      if (teamStats.activeDirectReferralsCount < minActiveDirectReferrals) {
        return {
          eligible: false,
          reason: `L3: active direct referrals ${teamStats.activeDirectReferralsCount} < required ${minActiveDirectReferrals}`,
        };
      }
      if (teamStats.teamVolume < minTeamVolumeUsdt) {
        return {
          eligible: false,
          reason: `L3: team volume $${teamStats.teamVolume.toFixed(2)} < required $${minTeamVolumeUsdt}`,
        };
      }
      return { eligible: true };
    }

    return { eligible: false, reason: "Invalid level" };
  }

  /**
   * Distributes 3-level referral commissions on daily staking reward generation.
   *
   * Commission is calculated on the ELIGIBLE DAILY STAKING REWARD AMOUNT —
   * NOT on the staking principal.
   *
   * L1: 10% of earner's daily staking reward → earner's direct sponsor
   * L2: 3%  of earner's daily staking reward → earner's sponsor's sponsor
   * L3: 2%  of earner's daily staking reward → earner's sponsor's sponsor's sponsor
   *
   * @param earnerAddress  The user who generated the daily staking reward
   * @param dailyRewardAmount  The eligible daily staking reward amount
   * @param token  "ADS" or "USDT"
   * @param cronRunId  Unique identifier for this cron run (for idempotency)
   */
  public static processReferralCommissions(
    earnerAddress: string,
    dailyRewardAmount: number,
    token: "ADS" | "USDT",
    cronRunId: string
  ): ReferralCommissionRecord[] {
    if (dailyRewardAmount <= 0) return [];

    const upline = this.getUpline(earnerAddress);
    const createdRecords: ReferralCommissionRecord[] = [];
    const now = Date.now();

    // --- L1 Check (10%) — earner's direct sponsor ---
    if (upline.l1) {
      const l1 = upline.l1;
      const eligibility = this.checkSponsorEligibility(l1, 1);

      if (eligibility.eligible) {
        const commissionAmount = Number((dailyRewardAmount * REFERRAL_RATES.L1).toFixed(8));
        const idempotencyKey = makeReferralCommissionKey(earnerAddress, l1.address, 1, cronRunId);

        const rec: ReferralCommissionRecord = {
          id: idempotencyKey,
          recipientAddress: l1.address,
          fromUserAddress: earnerAddress,
          level: 1,
          commissionPercentage: REFERRAL_RATES.L1 * 100,
          baseRewardAmount: dailyRewardAmount,
          commissionAmount,
          token,
          timestamp: now,
        };

        const added = db.addReferralCommission(rec, idempotencyKey);
        if (added) {
          if (token === "ADS") {
            l1.pendingAdsRewards = Number((l1.pendingAdsRewards + commissionAmount).toFixed(8));
          } else {
            l1.pendingUsdtRewards = Number((l1.pendingUsdtRewards + commissionAmount).toFixed(8));
          }
          db.updateUser(l1);
          createdRecords.push(rec);
        }
      } else {
        console.log(`[Referral] L1 sponsor ${l1.address} ineligible: ${eligibility.reason}`);
      }
    }

    // --- L2 Check (3%) — earner's sponsor's sponsor ---
    if (upline.l2) {
      const l2 = upline.l2;
      const eligibility = this.checkSponsorEligibility(l2, 2);

      if (eligibility.eligible) {
        const commissionAmount = Number((dailyRewardAmount * REFERRAL_RATES.L2).toFixed(8));
        const idempotencyKey = makeReferralCommissionKey(earnerAddress, l2.address, 2, cronRunId);

        const rec: ReferralCommissionRecord = {
          id: idempotencyKey,
          recipientAddress: l2.address,
          fromUserAddress: earnerAddress,
          level: 2,
          commissionPercentage: REFERRAL_RATES.L2 * 100,
          baseRewardAmount: dailyRewardAmount,
          commissionAmount,
          token,
          timestamp: now,
        };

        const added = db.addReferralCommission(rec, idempotencyKey);
        if (added) {
          if (token === "ADS") {
            l2.pendingAdsRewards = Number((l2.pendingAdsRewards + commissionAmount).toFixed(8));
          } else {
            l2.pendingUsdtRewards = Number((l2.pendingUsdtRewards + commissionAmount).toFixed(8));
          }
          db.updateUser(l2);
          createdRecords.push(rec);
        }
      } else {
        console.log(`[Referral] L2 sponsor ${l2.address} ineligible: ${eligibility.reason}`);
      }
    }

    // --- L3 Check (2%) — earner's sponsor's sponsor's sponsor ---
    if (upline.l3) {
      const l3 = upline.l3;
      const eligibility = this.checkSponsorEligibility(l3, 3);

      if (eligibility.eligible) {
        const commissionAmount = Number((dailyRewardAmount * REFERRAL_RATES.L3).toFixed(8));
        const idempotencyKey = makeReferralCommissionKey(earnerAddress, l3.address, 3, cronRunId);

        const rec: ReferralCommissionRecord = {
          id: idempotencyKey,
          recipientAddress: l3.address,
          fromUserAddress: earnerAddress,
          level: 3,
          commissionPercentage: REFERRAL_RATES.L3 * 100,
          baseRewardAmount: dailyRewardAmount,
          commissionAmount,
          token,
          timestamp: now,
        };

        const added = db.addReferralCommission(rec, idempotencyKey);
        if (added) {
          if (token === "ADS") {
            l3.pendingAdsRewards = Number((l3.pendingAdsRewards + commissionAmount).toFixed(8));
          } else {
            l3.pendingUsdtRewards = Number((l3.pendingUsdtRewards + commissionAmount).toFixed(8));
          }
          db.updateUser(l3);
          createdRecords.push(rec);
        }
      } else {
        console.log(`[Referral] L3 sponsor ${l3.address} ineligible: ${eligibility.reason}`);
      }
    }

    return createdRecords;
  }

  /**
   * =========================================================================
   * DETAILED REFERRAL TREE (for dashboard display)
   * =========================================================================
   * Generates a comprehensive report of L1, L2, L3 downlines for a sponsor.
   *
   * CRITICAL FIX: L1, L2, L3 are determined by the sponsor-downline relationship,
   * NOT by reading u.referrerAddress into the response as "sponsorAddress".
   * The `sponsorAddress` field in L2/L3 rows now shows the CORRECT intermediate
   * sponsor (i.e., the L1 parent for L2, or the L2 parent for L3).
   * =========================================================================
   */
  public static getDetailedReferralTree(sponsorAddress: string) {
    const normalized = sponsorAddress.toLowerCase();
    const allAdsStakes = db.getAdsStakes();
    const allUsdtStakes = db.getUsdtStakes();
    const allCommissions = db.getReferralCommissions(sponsorAddress);
    const allDiffBonuses = db.getDifferentialBonuses(sponsorAddress);

    const getUserStakeInfo = (userAddr: string) => {
      const uAds = allAdsStakes.filter(
        (s) => s.userAddress.toLowerCase() === userAddr.toLowerCase()
      );
      const uUsdt = allUsdtStakes.filter(
        (s) => s.userAddress.toLowerCase() === userAddr.toLowerCase()
      );
      const totalAds = uAds.reduce((acc, s) => acc + s.amount, 0);
      const totalUsdt = uUsdt.reduce((acc, s) => acc + s.amountUsdt, 0);
      const totalUsd = toUsdtEquivalent(totalAds, totalUsdt);

      // Calculate daily reward generated by this user
      let dailyRewardGeneratedUsd = 0;
      for (const s of uAds) {
        if (s.status === "ACTIVE" && !s.isMatured) {
          dailyRewardGeneratedUsd += ((s.amount * s.dailyRoiBps) / 10000) * 0.50;
        }
      }
      for (const s of uUsdt) {
        if (s.status === "ACTIVE") {
          dailyRewardGeneratedUsd += s.amountUsdt * 0.01;
        }
      }
      // Fallback: if no individual stake records but user has principal, estimate 1% daily
      if (dailyRewardGeneratedUsd === 0 && totalUsd > 0) {
        dailyRewardGeneratedUsd = totalUsd * 0.01;
      }

      const allUserStakes = [...uAds, ...uUsdt].sort((a, b) => b.startTime - a.startTime);
      const latestTx =
        allUserStakes[0]?.txHash ||
        "0x" + Buffer.from(userAddr + "_tx")
          .toString("hex")
          .padEnd(64, "0")
          .slice(0, 66);
      const latestDate =
        allUserStakes[0]?.startTime ||
        db.getUser(userAddr)?.registeredAt ||
        Date.now();

      return { totalAds, totalUsdt, totalUsd, dailyRewardGeneratedUsd, txHash: latestTx, latestDate };
    };

    // ── L1: Direct referrals of the sponsor ──────────────────────────────────
    const l1Users = this.getDirectReferrals(sponsorAddress);

    const l1Members = l1Users.map((u) => {
      const info = getUserStakeInfo(u.address);
      // Commission earned BY the sponsor FROM this L1 user
      const earned = allCommissions
        .filter(
          (c) =>
            c.fromUserAddress.toLowerCase() === u.address.toLowerCase() &&
            c.level === 1
        )
        .reduce((acc, c) => acc + c.commissionAmount, 0);
      const expectedDaily = Number((info.dailyRewardGeneratedUsd * REFERRAL_RATES.L1).toFixed(4));
      return {
        walletAddress: u.address,
        // For L1, there is no intermediate sponsor between sponsor and this user
        stakeAmountAds: info.totalAds,
        stakeAmountUsdt: info.totalUsdt,
        totalStakeUsd: info.totalUsd,
        date: new Date(info.latestDate).toISOString().replace("T", " ").slice(0, 19),
        txnHash: info.txHash,
        dailyRewardGenerated: Number(info.dailyRewardGeneratedUsd.toFixed(2)),
        commissionEarned: earned > 0 ? earned : expectedDaily,
      };
    });

    // ── L2: Referrals of L1 users (sponsor's second-level downlines) ─────────
    const l2Users = this.getL2Referrals(sponsorAddress);

    const l2Members = l2Users.map((u) => {
      const info = getUserStakeInfo(u.address);
      const earned = allCommissions
        .filter(
          (c) =>
            c.fromUserAddress.toLowerCase() === u.address.toLowerCase() &&
            c.level === 2
        )
        .reduce((acc, c) => acc + c.commissionAmount, 0);
      const expectedDaily = Number((info.dailyRewardGeneratedUsd * REFERRAL_RATES.L2).toFixed(4));
      return {
        walletAddress: u.address,
        intermediateSponsorAddress: u.referrerAddress || "",
        stakeAmountAds: info.totalAds,
        stakeAmountUsdt: info.totalUsdt,
        totalStakeUsd: info.totalUsd,
        date: new Date(info.latestDate).toISOString().replace("T", " ").slice(0, 19),
        txnHash: info.txHash,
        dailyRewardGenerated: Number(info.dailyRewardGeneratedUsd.toFixed(2)),
        commissionEarned: earned > 0 ? earned : expectedDaily,
      };
    });

    // ── L3: Referrals of L2 users (sponsor's third-level downlines) ──────────
    const l3Users = this.getL3Referrals(sponsorAddress);

    const l3Members = l3Users.map((u) => {
      const info = getUserStakeInfo(u.address);
      const earned = allCommissions
        .filter(
          (c) =>
            c.fromUserAddress.toLowerCase() === u.address.toLowerCase() &&
            c.level === 3
        )
        .reduce((acc, c) => acc + c.commissionAmount, 0);
      const expectedDaily = Number((info.dailyRewardGeneratedUsd * REFERRAL_RATES.L3).toFixed(4));
      return {
        walletAddress: u.address,
        /**
         * FIXED: `intermediateSponsorAddress` here is the L2 user who directly
         * referred this L3 user. NOT the original sponsor (that would be incorrect).
         */
        intermediateSponsorAddress: u.referrerAddress || "",
        stakeAmountAds: info.totalAds,
        stakeAmountUsdt: info.totalUsdt,
        totalStakeUsd: info.totalUsd,
        date: new Date(info.latestDate).toISOString().replace("T", " ").slice(0, 19),
        txnHash: info.txHash,
        dailyRewardGenerated: Number(info.dailyRewardGeneratedUsd.toFixed(2)),
        commissionEarned: earned > 0 ? earned : expectedDaily,
      };
    });

    const l1Earned = allCommissions
      .filter((c) => c.level === 1)
      .reduce((acc, c) => acc + c.commissionAmount, 0);
    const l2Earned = allCommissions
      .filter((c) => c.level === 2)
      .reduce((acc, c) => acc + c.commissionAmount, 0);
    const l3Earned = allCommissions
      .filter((c) => c.level === 3)
      .reduce((acc, c) => acc + c.commissionAmount, 0);

    const l1Projected = l1Members.reduce((sum, m) => sum + m.commissionEarned, 0);
    const l2Projected = l2Members.reduce((sum, m) => sum + m.commissionEarned, 0);
    const l3Projected = l3Members.reduce((sum, m) => sum + m.commissionEarned, 0);

    // Tier income breakdown
    const tiers = ["V1", "V2", "V3", "V4", "V5", "V6"] as const;
    const tierBreakdown = tiers.map((tier) => {
      const bonuses = allDiffBonuses.filter((b) => b.downlineTier === tier);
      const totalEarned = bonuses.reduce((acc, b) => acc + b.bonusAmount, 0);
      return { tier, totalEarned, count: bonuses.length };
    });

    return {
      summary: {
        totalL1: l1Members.length,
        totalL2: l2Members.length,
        totalL3: l3Members.length,
        totalL1Earned: l1Earned > 0 ? l1Earned : l1Projected,
        totalL2Earned: l2Earned > 0 ? l2Earned : l2Projected,
        totalL3Earned: l3Earned > 0 ? l3Earned : l3Projected,
        totalReferralEarned:
          l1Earned + l2Earned + l3Earned > 0
            ? l1Earned + l2Earned + l3Earned
            : l1Projected + l2Projected + l3Projected,
      },
      l1Members,
      l2Members,
      l3Members,
      tierIncome: {
        totalTierEarned: allDiffBonuses.reduce((acc, b) => acc + b.bonusAmount, 0),
        tierBreakdown,
        history: allDiffBonuses.map((b) => ({
          id: b.id,
          fromUserAddress: b.downlineAddress,
          downlineTier: b.downlineTier,
          userTier: b.recipientTier,
          differentialRate: b.differentialRate,
          eligibleVolume: b.eligibleVolume,
          bonusAmount: b.bonusAmount,
          token: "ADS" as const,
          timestamp: b.timestamp,
          txHash: b.id,
        })),
      },
    };
  }

  /**
   * Test helper: adds a simulated downline at a given level under a sponsor.
   * Used only for testing/demo — NOT for production use.
   */
  public static addTestDownline(
    sponsorAddress: string,
    level: 1 | 2 | 3,
    stakeAmount: number,
    stakeToken: "ADS" | "USDT" = "USDT"
  ) {
    const sponsorNorm = sponsorAddress.toLowerCase();
    db.getOrCreateUser(sponsorNorm);

    // Pick actual referrer based on requested downline level
    let actualReferrer = sponsorNorm;
    if (level === 2) {
      const l1s = this.getDirectReferrals(sponsorNorm);
      if (l1s.length > 0) {
        actualReferrer = l1s[0].address;
      } else {
        const dummyL1 = "0x" + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
        db.getOrCreateUser(dummyL1, sponsorNorm);
        actualReferrer = dummyL1;
      }
    } else if (level === 3) {
      const l1s = this.getDirectReferrals(sponsorNorm);
      let l1Addr = l1s.length > 0 ? l1s[0].address : "";
      if (!l1Addr) {
        l1Addr = "0x" + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
        db.getOrCreateUser(l1Addr, sponsorNorm);
      }
      const l2s = this.getL2Referrals(sponsorNorm);
      if (l2s.length > 0) {
        actualReferrer = l2s[0].address;
      } else {
        const dummyL2 = "0x" + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
        db.getOrCreateUser(dummyL2, l1Addr);
        actualReferrer = dummyL2;
      }
    }

    const randomHex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    const newMemberAddr = `0x${randomHex}`;
    db.getOrCreateUser(newMemberAddr, actualReferrer);
    const mockTx =
      "0x" +
      Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

    const cronRunId = "test_" + Date.now();
    if (stakeToken === "ADS") {
      StakingService.stakeADS(newMemberAddr, stakeAmount, 360, actualReferrer, mockTx);
      const dailyReward = (stakeAmount * 100) / 10000;
      this.processReferralCommissions(newMemberAddr, dailyReward, "ADS", cronRunId);
    } else {
      StakingService.stakeUSDT(newMemberAddr, stakeAmount, actualReferrer, mockTx);
      const dailyReward = stakeAmount * 0.01;
      this.processReferralCommissions(newMemberAddr, dailyReward, "USDT", cronRunId);
    }

    return this.getDetailedReferralTree(sponsorNorm);
  }

  public static resetUserData(userAddress: string) {
    db.clearUserData(userAddress);
  }
}
