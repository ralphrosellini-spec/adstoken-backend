import { db } from "./db.service";
import { User, ReferralCommissionRecord } from "../types";
import { StakingService } from "./staking.service";

export class ReferralService {
  /**
   * Builds the 3-level upline chain for a user.
   */
  public static getUpline(userAddress: string): { l1: User | null; l2: User | null; l3: User | null } {
    const user = db.getUser(userAddress);
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
   * Gets direct referrals (L1 downlines).
   */
  public static getDirectReferrals(sponsorAddress: string): User[] {
    const normalized = sponsorAddress.toLowerCase();
    return db.getAllUsers().filter((u) => u.referrerAddress?.toLowerCase() === normalized);
  }

  /**
   * Calculates total team staking volume (in USD equivalent).
   */
  public static getTeamStats(sponsorAddress: string) {
    const directReferrals = this.getDirectReferrals(sponsorAddress);
    let directVolume = 0;
    let teamVolume = 0;
    const teamAddresses = new Set<string>();

    // L1
    for (const d of directReferrals) {
      const vol = d.totalStakedUsdt + d.totalStakedAds * 0.50; // $0.50 per ADS
      directVolume += vol;
      teamVolume += vol;
      teamAddresses.add(d.address);

      // L2
      const l2List = this.getDirectReferrals(d.address);
      for (const l2 of l2List) {
        const l2Vol = l2.totalStakedUsdt + l2.totalStakedAds * 0.50;
        teamVolume += l2Vol;
        teamAddresses.add(l2.address);

        // L3
        const l3List = this.getDirectReferrals(l2.address);
        for (const l3 of l3List) {
          const l3Vol = l3.totalStakedUsdt + l3.totalStakedAds * 0.50;
          teamVolume += l3Vol;
          teamAddresses.add(l3.address);
        }
      }
    }

    return {
      directReferralsCount: directReferrals.length,
      directVolume,
      totalTeamCount: teamAddresses.size,
      teamVolume,
    };
  }

  /**
   * Distributes 3-level referral commissions on daily staking reward generation.
   * Whitepaper Page 9:
   * L1: 10% (Condition: Sponsor personal staking >= $100, referral volume >= $100)
   * L2: 3%  (Condition: >= 2 active referrals, team volume >= $500)
   * L3: 2%  (Condition: >= 3 active referrals, team volume >= $1,000)
   */
  public static processReferralCommissions(
    earnerAddress: string,
    dailyRewardAmount: number,
    token: "ADS" | "USDT"
  ): ReferralCommissionRecord[] {
    const upline = this.getUpline(earnerAddress);
    const createdRecords: ReferralCommissionRecord[] = [];

    // --- L1 Check (10%) ---
    if (upline.l1) {
      const l1 = upline.l1;
      const l1PersonalStake = l1.totalStakedUsdt + l1.totalStakedAds * 0.50;
      const l1TeamStats = this.getTeamStats(l1.address);

      const isL1Eligible = l1PersonalStake >= 100 && l1TeamStats.directVolume >= 100;
      if (isL1Eligible) {
        const commissionAmount = dailyRewardAmount * 0.10;
        const rec: ReferralCommissionRecord = {
          id: "ref_" + Date.now() + "_l1_" + Math.floor(Math.random() * 1000),
          recipientAddress: l1.address,
          fromUserAddress: earnerAddress,
          level: 1,
          commissionPercentage: 10,
          baseRewardAmount: dailyRewardAmount,
          commissionAmount,
          token,
          timestamp: Date.now(),
        };
        db.addReferralCommission(rec);

        if (token === "ADS") {
          l1.pendingAdsRewards += commissionAmount;
        } else {
          l1.pendingUsdtRewards += commissionAmount;
        }
        db.updateUser(l1);
        createdRecords.push(rec);
      }
    }

    // --- L2 Check (3%) ---
    if (upline.l2) {
      const l2 = upline.l2;
      const l2PersonalStake = l2.totalStakedUsdt + l2.totalStakedAds * 0.50;
      const l2TeamStats = this.getTeamStats(l2.address);

      const isL2Eligible = l2TeamStats.directReferralsCount >= 2 && l2TeamStats.teamVolume >= 500;
      if (isL2Eligible) {
        const commissionAmount = dailyRewardAmount * 0.03;
        const rec: ReferralCommissionRecord = {
          id: "ref_" + Date.now() + "_l2_" + Math.floor(Math.random() * 1000),
          recipientAddress: l2.address,
          fromUserAddress: earnerAddress,
          level: 2,
          commissionPercentage: 3,
          baseRewardAmount: dailyRewardAmount,
          commissionAmount,
          token,
          timestamp: Date.now(),
        };
        db.addReferralCommission(rec);

        if (token === "ADS") {
          l2.pendingAdsRewards += commissionAmount;
        } else {
          l2.pendingUsdtRewards += commissionAmount;
        }
        db.updateUser(l2);
        createdRecords.push(rec);
      }
    }

    // --- L3 Check (2%) ---
    if (upline.l3) {
      const l3 = upline.l3;
      const l3PersonalStake = l3.totalStakedUsdt + l3.totalStakedAds * 0.50;
      const l3TeamStats = this.getTeamStats(l3.address);

      const isL3Eligible = l3TeamStats.directReferralsCount >= 3 && l3TeamStats.teamVolume >= 1000;
      if (isL3Eligible) {
        const commissionAmount = dailyRewardAmount * 0.02;
        const rec: ReferralCommissionRecord = {
          id: "ref_" + Date.now() + "_l3_" + Math.floor(Math.random() * 1000),
          recipientAddress: l3.address,
          fromUserAddress: earnerAddress,
          level: 3,
          commissionPercentage: 2,
          baseRewardAmount: dailyRewardAmount,
          commissionAmount,
          token,
          timestamp: Date.now(),
        };
        db.addReferralCommission(rec);

        if (token === "ADS") {
          l3.pendingAdsRewards += commissionAmount;
        } else {
          l3.pendingUsdtRewards += commissionAmount;
        }
        db.updateUser(l3);
        createdRecords.push(rec);
      }
    }

    return createdRecords;
  }

  /**
   * Generates comprehensive report of L1, L2, L3 downlines & Tier incomes.
   */
  public static getDetailedReferralTree(sponsorAddress: string) {
    const normalized = sponsorAddress.toLowerCase();
    const allUsers = db.getAllUsers();
    const allAdsStakes = db.getAdsStakes();
    const allUsdtStakes = db.getUsdtStakes();
    const allCommissions = db.getReferralCommissions(sponsorAddress);
    const allDiffBonuses = db.getDifferentialBonuses(sponsorAddress);

    const getUserStakeInfo = (userAddr: string) => {
      const uAds = allAdsStakes.filter((s) => s.userAddress.toLowerCase() === userAddr.toLowerCase());
      const uUsdt = allUsdtStakes.filter((s) => s.userAddress.toLowerCase() === userAddr.toLowerCase());
      const totalAds = uAds.reduce((acc, s) => acc + s.amount, 0);
      const totalUsdt = uUsdt.reduce((acc, s) => acc + s.amountUsdt, 0);
      const totalUsd = totalUsdt + totalAds * 0.50;

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
      if (dailyRewardGeneratedUsd === 0 && totalUsd > 0) {
        dailyRewardGeneratedUsd = totalUsd * 0.01;
      }

      const latestTx =
        [...uAds, ...uUsdt].sort((a, b) => b.startTime - a.startTime)[0]?.txHash ||
        "0x" + Buffer.from(userAddr + "_tx").toString("hex").padEnd(64, "0").slice(0, 66);
      const latestDate =
        [...uAds, ...uUsdt].sort((a, b) => b.startTime - a.startTime)[0]?.startTime ||
        allUsers.find((u) => u.address.toLowerCase() === userAddr.toLowerCase())?.registeredAt ||
        Date.now();
      return { totalAds, totalUsdt, totalUsd, dailyRewardGeneratedUsd, txHash: latestTx, latestDate };
    };

    // L1 (10% Direct)
    const l1Users = allUsers.filter((u) => u.referrerAddress?.toLowerCase() === normalized);
    const l1Members = l1Users.map((u) => {
      const info = getUserStakeInfo(u.address);
      const earned = allCommissions
        .filter((c) => c.fromUserAddress.toLowerCase() === u.address.toLowerCase() && c.level === 1)
        .reduce((acc, c) => acc + c.commissionAmount, 0);
      const expectedDaily = Number((info.dailyRewardGeneratedUsd * 0.10).toFixed(4));
      return {
        walletAddress: u.address,
        stakeAmountAds: info.totalAds,
        stakeAmountUsdt: info.totalUsdt,
        totalStakeUsd: info.totalUsd,
        date: new Date(info.latestDate).toISOString().replace("T", " ").slice(0, 19),
        txnHash: info.txHash,
        dailyRewardGenerated: Number(info.dailyRewardGeneratedUsd.toFixed(2)),
        commissionEarned: earned > 0 ? earned : expectedDaily,
      };
    });

    // L2 (3% Second Level)
    const l1AddressSet = new Set(l1Users.map((u) => u.address.toLowerCase()));
    const l2Users = allUsers.filter(
      (u) => u.referrerAddress && l1AddressSet.has(u.referrerAddress.toLowerCase())
    );
    const l2Members = l2Users.map((u) => {
      const info = getUserStakeInfo(u.address);
      const earned = allCommissions
        .filter((c) => c.fromUserAddress.toLowerCase() === u.address.toLowerCase() && c.level === 2)
        .reduce((acc, c) => acc + c.commissionAmount, 0);
      const expectedDaily = Number((info.dailyRewardGeneratedUsd * 0.03).toFixed(4));
      return {
        walletAddress: u.address,
        sponsorAddress: u.referrerAddress || "",
        stakeAmountAds: info.totalAds,
        stakeAmountUsdt: info.totalUsdt,
        totalStakeUsd: info.totalUsd,
        date: new Date(info.latestDate).toISOString().replace("T", " ").slice(0, 19),
        txnHash: info.txHash,
        dailyRewardGenerated: Number(info.dailyRewardGeneratedUsd.toFixed(2)),
        commissionEarned: earned > 0 ? earned : expectedDaily,
      };
    });

    // L3 (2% Third Level)
    const l2AddressSet = new Set(l2Users.map((u) => u.address.toLowerCase()));
    const l3Users = allUsers.filter(
      (u) => u.referrerAddress && l2AddressSet.has(u.referrerAddress.toLowerCase())
    );
    const l3Members = l3Users.map((u) => {
      const info = getUserStakeInfo(u.address);
      const earned = allCommissions
        .filter((c) => c.fromUserAddress.toLowerCase() === u.address.toLowerCase() && c.level === 3)
        .reduce((acc, c) => acc + c.commissionAmount, 0);
      const expectedDaily = Number((info.dailyRewardGeneratedUsd * 0.02).toFixed(4));
      return {
        walletAddress: u.address,
        sponsorAddress: u.referrerAddress || "",
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

    // Tier Income Breakdown (V1 to V6)
    const tiers = ["V1", "V2", "V3", "V4", "V5", "V6"] as const;
    const tierBreakdown = tiers.map((tier) => {
      const bonuses = allDiffBonuses.filter((b) => b.downlineTier === tier);
      const totalEarned = bonuses.reduce((acc, b) => acc + b.bonusAmount, 0);
      return {
        tier,
        totalEarned,
        count: bonuses.length,
      };
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
          (l1Earned + l2Earned + l3Earned) > 0
            ? (l1Earned + l2Earned + l3Earned)
            : (l1Projected + l2Projected + l3Projected),
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
