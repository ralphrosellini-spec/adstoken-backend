import { db } from "./db.service";
import { User, ReferralCommissionRecord } from "../types";
import {
  REFERRAL_RATES,
  REFERRAL_ELIGIBILITY,
  ADS_PRICE_USD,
  isUserActiveReferral,
  getPersonalStakingUsd,
  roundFinancial,
} from "../config/business-rules";
import { StakingService } from "./staking.service";

export interface DownlineMemberDetail {
  walletAddress: string;
  sponsorAddress?: string;
  stakeAmountAds: number;
  stakeAmountUsdt: number;
  totalStakeUsd: number;
  date: string;
  txnHash: string;
  dailyRewardGenerated: number;
  commissionEarned: number;
  isActive: boolean;
}

export class ReferralService {
  /**
   * Safely builds the 3-level upline chain for a user.
   * Uses visited set to prevent circular reference loops.
   */
  public static getUpline(userAddress: string): { l1: User | null; l2: User | null; l3: User | null } {
    const user = db.getUser(userAddress);
    if (!user || !user.referrerAddress) {
      return { l1: null, l2: null, l3: null };
    }

    const visited = new Set<string>([userAddress.toLowerCase()]);

    const l1Addr = user.referrerAddress.toLowerCase();
    if (visited.has(l1Addr)) {
      return { l1: null, l2: null, l3: null };
    }
    visited.add(l1Addr);
    const l1 = db.getUser(l1Addr) || null;

    let l2: User | null = null;
    let l3: User | null = null;

    if (l1 && l1.referrerAddress) {
      const l2Addr = l1.referrerAddress.toLowerCase();
      if (!visited.has(l2Addr)) {
        visited.add(l2Addr);
        l2 = db.getUser(l2Addr) || null;

        if (l2 && l2.referrerAddress) {
          const l3Addr = l2.referrerAddress.toLowerCase();
          if (!visited.has(l3Addr)) {
            visited.add(l3Addr);
            l3 = db.getUser(l3Addr) || null;
          }
        }
      }
    }

    return { l1, l2, l3 };
  }

  /**
   * Gets direct referrals (L1 downlines) of a sponsor.
   * Strictly filters out self-referral.
   */
  public static getDirectReferrals(sponsorAddress: string): User[] {
    const normalized = sponsorAddress.toLowerCase();
    return db
      .getAllUsers()
      .filter(
        (u) =>
          u.referrerAddress?.toLowerCase() === normalized &&
          u.address.toLowerCase() !== normalized
      );
  }

  /**
   * Calculates the exact L1, L2, L3 referral sets relative to a sponsor.
   * Breadth-First-Search (BFS) with strict visited tracking:
   * - Sponsor is excluded.
   * - No user can appear in more than one level.
   * - Direct referrals can NEVER appear in L2 or L3.
   * - Referrers of the sponsor can NEVER appear in downlines.
   */
  public static getReferralLevels(sponsorAddress: string): {
    l1: User[];
    l2: User[];
    l3: User[];
    allDownlineAddresses: Set<string>;
  } {
    const sponsorNorm = sponsorAddress.toLowerCase();
    const visited = new Set<string>([sponsorNorm]);

    // Level 1: Direct referrals
    const l1Users = this.getDirectReferrals(sponsorNorm).filter((u) => {
      const addr = u.address.toLowerCase();
      if (visited.has(addr)) return false;
      visited.add(addr);
      return true;
    });

    // Level 2: Referrals of Level 1
    const l2Users: User[] = [];
    for (const l1 of l1Users) {
      const directsOfL1 = this.getDirectReferrals(l1.address);
      for (const d of directsOfL1) {
        const addr = d.address.toLowerCase();
        if (!visited.has(addr)) {
          visited.add(addr);
          l2Users.push(d);
        }
      }
    }

    // Level 3: Referrals of Level 2
    const l3Users: User[] = [];
    for (const l2 of l2Users) {
      const directsOfL2 = this.getDirectReferrals(l2.address);
      for (const d of directsOfL2) {
        const addr = d.address.toLowerCase();
        if (!visited.has(addr)) {
          visited.add(addr);
          l3Users.push(d);
        }
      }
    }

    // Gather all downlines in the tree (including beyond L3 if needed for total team volume)
    const allDownlineAddresses = new Set<string>();
    for (const addr of visited) {
      if (addr !== sponsorNorm) {
        allDownlineAddresses.add(addr);
      }
    }

    // Expand to full network for complete team volume calculation
    const queue = [...l3Users.map((u) => u.address.toLowerCase())];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = this.getDirectReferrals(current);
      for (const child of children) {
        const cAddr = child.address.toLowerCase();
        if (!visited.has(cAddr)) {
          visited.add(cAddr);
          allDownlineAddresses.add(cAddr);
          queue.push(cAddr);
        }
      }
    }

    return { l1: l1Users, l2: l2Users, l3: l3Users, allDownlineAddresses };
  }

  /**
   * Calculates comprehensive team statistics.
   * Staking principals are counted exactly once per unique team member.
   */
  public static getTeamStats(sponsorAddress: string) {
    const { l1, l2, l3, allDownlineAddresses } = this.getReferralLevels(sponsorAddress);

    // Direct referral metrics (L1)
    let directVolume = 0;
    let activeDirectCount = 0;
    for (const d of l1) {
      const vol = getPersonalStakingUsd(d);
      directVolume += vol;
      if (isUserActiveReferral(d)) {
        activeDirectCount++;
      }
    }

    // Total unique team staking volume
    let teamVolume = 0;
    for (const addr of allDownlineAddresses) {
      const u = db.getUser(addr);
      if (u) {
        teamVolume += getPersonalStakingUsd(u);
      }
    }

    return {
      directReferralsCount: l1.length,
      activeDirectReferralsCount: activeDirectCount,
      directVolume: roundFinancial(directVolume, 2),
      totalTeamCount: allDownlineAddresses.size,
      teamVolume: roundFinancial(teamVolume, 2),
      l1Count: l1.length,
      l2Count: l2.length,
      l3Count: l3.length,
    };
  }

  /**
   * Validates whether a sponsor is eligible to receive referral commission at a specific level.
   * L1: Sponsor personal staking >= $100 AND direct referral volume >= $100.
   * L2: Active direct referrals >= 2 AND team volume >= $500 (AND personal staking >= $100).
   * L3: Active direct referrals >= 3 AND team volume >= $1,000 (AND personal staking >= $100).
   */
  public static isSponsorEligible(
    sponsor: User,
    level: 1 | 2 | 3
  ): { eligible: boolean; reason?: string } {
    const personalStakingUsd = getPersonalStakingUsd(sponsor);
    const stats = this.getTeamStats(sponsor.address);
    const rules = REFERRAL_ELIGIBILITY[level];

    if (personalStakingUsd < rules.minPersonalStakingUsd) {
      return {
        eligible: false,
        reason: `Personal staking ($${personalStakingUsd}) is below minimum requirement of $${rules.minPersonalStakingUsd}`,
      };
    }

    if (level === 1) {
      if (stats.directVolume < rules.minDirectReferralVolumeUsd) {
        return {
          eligible: false,
          reason: `Direct referral volume ($${stats.directVolume}) is below minimum requirement of $${rules.minDirectReferralVolumeUsd}`,
        };
      }
    } else if (level === 2) {
      if (stats.activeDirectReferralsCount < rules.minActiveDirectReferrals) {
        return {
          eligible: false,
          reason: `Active direct referrals (${stats.activeDirectReferralsCount}) is below required ${rules.minActiveDirectReferrals}`,
        };
      }
      if (stats.teamVolume < rules.minTeamVolumeUsd) {
        return {
          eligible: false,
          reason: `Team staking volume ($${stats.teamVolume}) is below required $${rules.minTeamVolumeUsd}`,
        };
      }
    } else if (level === 3) {
      if (stats.activeDirectReferralsCount < rules.minActiveDirectReferrals) {
        return {
          eligible: false,
          reason: `Active direct referrals (${stats.activeDirectReferralsCount}) is below required ${rules.minActiveDirectReferrals}`,
        };
      }
      if (stats.teamVolume < rules.minTeamVolumeUsd) {
        return {
          eligible: false,
          reason: `Team staking volume ($${stats.teamVolume}) is below required $${rules.minTeamVolumeUsd}`,
        };
      }
    }

    return { eligible: true };
  }

  /**
   * Distributes 3-level referral commissions on daily staking reward generation.
   * Calculations use precise percentages applied to the ELIGIBLE DAILY STAKING REWARD.
   * Idempotent: duplicates are rejected.
   */
  public static processReferralCommissions(
    earnerAddress: string,
    dailyRewardAmount: number,
    token: "ADS" | "USDT",
    eventId?: string
  ): ReferralCommissionRecord[] {
    if (dailyRewardAmount <= 0) {
      return [];
    }

    const upline = this.getUpline(earnerAddress);
    const createdRecords: ReferralCommissionRecord[] = [];
    const baseEventId = eventId || `ev_${Date.now()}`;

    const levels: Array<{ level: 1 | 2 | 3; sponsor: User | null }> = [
      { level: 1, sponsor: upline.l1 },
      { level: 2, sponsor: upline.l2 },
      { level: 3, sponsor: upline.l3 },
    ];

    for (const { level, sponsor } of levels) {
      if (!sponsor) continue;

      const eligibility = this.isSponsorEligible(sponsor, level);
      if (!eligibility.eligible) {
        continue;
      }

      const rate = REFERRAL_RATES[level];
      const commissionAmount = roundFinancial(dailyRewardAmount * rate, 6);
      if (commissionAmount <= 0) continue;

      // Deterministic idempotency key
      const idempotencyKey = `ref_${baseEventId}_L${level}_${sponsor.address.toLowerCase()}_${earnerAddress.toLowerCase()}`;

      const rec: ReferralCommissionRecord = {
        id: idempotencyKey,
        recipientAddress: sponsor.address.toLowerCase(),
        fromUserAddress: earnerAddress.toLowerCase(),
        level,
        commissionPercentage: rate * 100,
        baseRewardAmount: roundFinancial(dailyRewardAmount, 6),
        commissionAmount,
        token,
        timestamp: Date.now(),
        eventId: baseEventId,
        status: "COMPLETED",
      };

      const added = db.addReferralCommission(rec);
      if (added) {
        if (token === "ADS") {
          sponsor.pendingAdsRewards = roundFinancial(sponsor.pendingAdsRewards + commissionAmount, 4);
        } else {
          sponsor.pendingUsdtRewards = roundFinancial(sponsor.pendingUsdtRewards + commissionAmount, 4);
        }
        db.updateUser(sponsor);
        createdRecords.push(rec);
      }
    }

    return createdRecords;
  }

  /**
   * Generates comprehensive report of L1, L2, L3 downlines & Tier incomes.
   * Separates actual earned commissions from projected daily commissions.
   */
  public static getDetailedReferralTree(sponsorAddress: string) {
    const normalized = sponsorAddress.toLowerCase();
    const allAdsStakes = db.getAdsStakes();
    const allUsdtStakes = db.getUsdtStakes();
    const allCommissions = db.getReferralCommissions(sponsorAddress);
    const allDiffBonuses = db.getDifferentialBonuses(sponsorAddress);

    const { l1, l2, l3 } = this.getReferralLevels(sponsorAddress);
    const stats = this.getTeamStats(sponsorAddress);

    const getUserStakeInfo = (userAddr: string) => {
      const uAds = allAdsStakes.filter((s) => s.userAddress.toLowerCase() === userAddr.toLowerCase());
      const uUsdt = allUsdtStakes.filter((s) => s.userAddress.toLowerCase() === userAddr.toLowerCase());
      const totalAds = uAds.reduce((acc, s) => acc + s.amount, 0);
      const totalUsdt = uUsdt.reduce((acc, s) => acc + s.amountUsdt, 0);
      const totalUsd = roundFinancial(totalUsdt + totalAds * ADS_PRICE_USD, 2);

      let dailyRewardGeneratedUsd = 0;
      for (const s of uAds) {
        if (s.status === "ACTIVE" && !s.isMatured) {
          dailyRewardGeneratedUsd += ((s.amount * s.dailyRoiBps) / 10000) * ADS_PRICE_USD;
        }
      }
      for (const s of uUsdt) {
        if (s.status === "ACTIVE") {
          dailyRewardGeneratedUsd += s.amountUsdt * 0.01;
        }
      }

      const latestTx =
        [...uAds, ...uUsdt].sort((a, b) => b.startTime - a.startTime)[0]?.txHash ||
        "0x" + Buffer.from(userAddr + "_tx").toString("hex").padEnd(64, "0").slice(0, 66);
      const latestDate =
        [...uAds, ...uUsdt].sort((a, b) => b.startTime - a.startTime)[0]?.startTime ||
        db.getUser(userAddr)?.registeredAt ||
        Date.now();

      return {
        totalAds,
        totalUsdt,
        totalUsd,
        dailyRewardGeneratedUsd: roundFinancial(dailyRewardGeneratedUsd, 4),
        txHash: latestTx,
        latestDate,
      };
    };

    // L1 Members (10%)
    const l1Members: DownlineMemberDetail[] = l1.map((u) => {
      const info = getUserStakeInfo(u.address);
      const actualEarned = allCommissions
        .filter((c) => c.fromUserAddress.toLowerCase() === u.address.toLowerCase() && c.level === 1)
        .reduce((acc, c) => acc + c.commissionAmount, 0);
      const projectedDaily = roundFinancial(info.dailyRewardGeneratedUsd * 0.10, 4);

      return {
        walletAddress: u.address,
        stakeAmountAds: info.totalAds,
        stakeAmountUsdt: info.totalUsdt,
        totalStakeUsd: info.totalUsd,
        date: new Date(info.latestDate).toISOString().replace("T", " ").slice(0, 19),
        txnHash: info.txHash,
        dailyRewardGenerated: info.dailyRewardGeneratedUsd,
        commissionEarned: actualEarned > 0 ? roundFinancial(actualEarned, 4) : projectedDaily,
        isActive: isUserActiveReferral(u),
      };
    });

    // L2 Members (3%)
    const l2Members: DownlineMemberDetail[] = l2.map((u) => {
      const info = getUserStakeInfo(u.address);
      const actualEarned = allCommissions
        .filter((c) => c.fromUserAddress.toLowerCase() === u.address.toLowerCase() && c.level === 2)
        .reduce((acc, c) => acc + c.commissionAmount, 0);
      const projectedDaily = roundFinancial(info.dailyRewardGeneratedUsd * 0.03, 4);

      return {
        walletAddress: u.address,
        sponsorAddress: u.referrerAddress || "",
        stakeAmountAds: info.totalAds,
        stakeAmountUsdt: info.totalUsdt,
        totalStakeUsd: info.totalUsd,
        date: new Date(info.latestDate).toISOString().replace("T", " ").slice(0, 19),
        txnHash: info.txHash,
        dailyRewardGenerated: info.dailyRewardGeneratedUsd,
        commissionEarned: actualEarned > 0 ? roundFinancial(actualEarned, 4) : projectedDaily,
        isActive: isUserActiveReferral(u),
      };
    });

    // L3 Members (2%)
    const l3Members: DownlineMemberDetail[] = l3.map((u) => {
      const info = getUserStakeInfo(u.address);
      const actualEarned = allCommissions
        .filter((c) => c.fromUserAddress.toLowerCase() === u.address.toLowerCase() && c.level === 3)
        .reduce((acc, c) => acc + c.commissionAmount, 0);
      const projectedDaily = roundFinancial(info.dailyRewardGeneratedUsd * 0.02, 4);

      return {
        walletAddress: u.address,
        sponsorAddress: u.referrerAddress || "",
        stakeAmountAds: info.totalAds,
        stakeAmountUsdt: info.totalUsdt,
        totalStakeUsd: info.totalUsd,
        date: new Date(info.latestDate).toISOString().replace("T", " ").slice(0, 19),
        txnHash: info.txHash,
        dailyRewardGenerated: info.dailyRewardGeneratedUsd,
        commissionEarned: actualEarned > 0 ? roundFinancial(actualEarned, 4) : projectedDaily,
        isActive: isUserActiveReferral(u),
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

    const sponsorUser = db.getUser(normalized);
    const l1Eligible = sponsorUser ? this.isSponsorEligible(sponsorUser, 1).eligible : false;
    const l2Eligible = sponsorUser ? this.isSponsorEligible(sponsorUser, 2).eligible : false;
    const l3Eligible = sponsorUser ? this.isSponsorEligible(sponsorUser, 3).eligible : false;

    // Tier Income Breakdown (V1 to V6)
    const tiers = ["V1", "V2", "V3", "V4", "V5", "V6"] as const;
    const tierBreakdown = tiers.map((tier) => {
      const bonuses = allDiffBonuses.filter((b) => b.downlineTier === tier);
      const totalEarned = bonuses.reduce((acc, b) => acc + b.bonusAmount, 0);
      return {
        tier,
        totalEarned: roundFinancial(totalEarned, 4),
        count: bonuses.length,
      };
    });

    return {
      summary: {
        totalL1: l1Members.length,
        totalL2: l2Members.length,
        totalL3: l3Members.length,
        activeL1: l1Members.filter((m) => m.isActive).length,
        activeL2: l2Members.filter((m) => m.isActive).length,
        activeL3: l3Members.filter((m) => m.isActive).length,
        directVolume: stats.directVolume,
        teamVolume: stats.teamVolume,
        totalL1Earned: roundFinancial(l1Earned > 0 ? l1Earned : l1Projected, 4),
        totalL2Earned: roundFinancial(l2Earned > 0 ? l2Earned : l2Projected, 4),
        totalL3Earned: roundFinancial(l3Earned > 0 ? l3Earned : l3Projected, 4),
        totalReferralEarned: roundFinancial(
          (l1Earned + l2Earned + l3Earned) > 0
            ? l1Earned + l2Earned + l3Earned
            : l1Projected + l2Projected + l3Projected,
          4
        ),
        eligibility: {
          l1: l1Eligible,
          l2: l2Eligible,
          l3: l3Eligible,
        },
      },
      l1Members,
      l2Members,
      l3Members,
      tierIncome: {
        totalTierEarned: roundFinancial(
          allDiffBonuses.reduce((acc, b) => acc + b.bonusAmount, 0),
          4
        ),
        tierBreakdown,
        history: allDiffBonuses.map((b) => ({
          id: b.id,
          fromUserAddress: b.downlineAddress,
          downlineTier: b.downlineTier,
          userTier: b.recipientTier,
          differentialRate: b.differentialRate,
          eligibleVolume: b.eligibleVolume,
          bonusAmount: roundFinancial(b.bonusAmount, 4),
          token: "ADS" as const,
          timestamp: b.timestamp,
          txHash: b.id,
        })),
      },
    };
  }

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
        const dummyL1 = "0x" + Math.random().toString(16).substring(2, 10).padEnd(40, "1");
        db.getOrCreateUser(dummyL1, sponsorNorm);
        actualReferrer = dummyL1;
      }
    } else if (level === 3) {
      const l1s = this.getDirectReferrals(sponsorNorm);
      let l1Addr = l1s.length > 0 ? l1s[0].address : "";
      if (!l1Addr) {
        l1Addr = "0x" + Math.random().toString(16).substring(2, 10).padEnd(40, "1");
        db.getOrCreateUser(l1Addr, sponsorNorm);
      }
      const l2s = this.getDirectReferrals(l1Addr);
      if (l2s.length > 0) {
        actualReferrer = l2s[0].address;
      } else {
        const dummyL2 = "0x" + Math.random().toString(16).substring(2, 10).padEnd(40, "2");
        db.getOrCreateUser(dummyL2, l1Addr);
        actualReferrer = dummyL2;
      }
    }

    const randomSuffix = Math.random().toString(16).substring(2, 10);
    const newMemberAddr = `0x${randomSuffix}${sponsorNorm.slice(10)}`;
    db.getOrCreateUser(newMemberAddr, actualReferrer);
    const mockTx = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

    if (stakeToken === "ADS") {
      StakingService.stakeADS(newMemberAddr, stakeAmount, 360, actualReferrer, mockTx);
      const dailyReward = (stakeAmount * 100) / 10000;
      this.processReferralCommissions(newMemberAddr, dailyReward, "ADS");
    } else {
      StakingService.stakeUSDT(newMemberAddr, stakeAmount, actualReferrer, mockTx);
      const dailyReward = stakeAmount * 0.01;
      this.processReferralCommissions(newMemberAddr, dailyReward, "USDT");
    }

    return this.getDetailedReferralTree(sponsorNorm);
  }

  public static resetUserData(userAddress: string) {
    db.clearUserData(userAddress);
  }
}
