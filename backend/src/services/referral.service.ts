import { db } from "./db.service";
import { User, ReferralCommissionRecord } from "../types";

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
      const vol = d.totalStakedUsdt + d.totalStakedAds * 0.1; // Using approximate peg or USDT
      directVolume += vol;
      teamVolume += vol;
      teamAddresses.add(d.address);

      // L2
      const l2List = this.getDirectReferrals(d.address);
      for (const l2 of l2List) {
        const l2Vol = l2.totalStakedUsdt + l2.totalStakedAds * 0.1;
        teamVolume += l2Vol;
        teamAddresses.add(l2.address);

        // L3
        const l3List = this.getDirectReferrals(l2.address);
        for (const l3 of l3List) {
          const l3Vol = l3.totalStakedUsdt + l3.totalStakedAds * 0.1;
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
      const l1PersonalStake = l1.totalStakedUsdt + (token === "ADS" ? l1.totalStakedAds * 0.1 : 0);
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
}
