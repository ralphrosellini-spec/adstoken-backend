import { db } from "./db.service";
import { AdsStakeRecord, UsdtStakeRecord, WithdrawalRecord } from "../types";

export interface StakingPlansResponse {
  adsPlans: {
    periodDays: number;
    title: string;
    dailyRoiPercentage: number;
    returnMultiplier: string;
    description: string;
  }[];
  usdtPlans: {
    minUsdt: number;
    maxUsdt: number | null;
    tierTitle: string;
    dailyRoiPercentage: number;
    returnCapMultiplier: number;
    burnPercentage: number;
    liquidityPercentage: number;
  }[];
}

export class StakingService {
  public static getPlans(): StakingPlansResponse {
    return {
      adsPlans: [
        {
          periodDays: 0,
          title: "Flexible Staking",
          dailyRoiPercentage: 0.20,
          returnMultiplier: "0.20% Daily",
          description: "Withdraw principal anytime. Earn 0.20% daily rewards.",
        },
        {
          periodDays: 30,
          title: "30 Days Locked",
          dailyRoiPercentage: 0.40,
          returnMultiplier: "0.40% Daily",
          description: "Lock for 30 days. Capital returned at maturity in ADS tokens.",
        },
        {
          periodDays: 90,
          title: "90 Days Locked",
          dailyRoiPercentage: 0.60,
          returnMultiplier: "0.60% Daily",
          description: "Lock for 90 days. Capital returned at maturity in ADS tokens.",
        },
        {
          periodDays: 180,
          title: "180 Days Locked",
          dailyRoiPercentage: 0.80,
          returnMultiplier: "0.80% Daily",
          description: "Lock for 180 days. Capital returned at maturity in ADS tokens.",
        },
        {
          periodDays: 360,
          title: "360 Days Locked",
          dailyRoiPercentage: 1.00,
          returnMultiplier: "1.00% Daily",
          description: "Lock for 360 days. Max emission rate. Capital returned at maturity.",
        },
      ],
      usdtPlans: [
        {
          minUsdt: 10,
          maxUsdt: 999,
          tierTitle: "Tier 1 ($10 - $999)",
          dailyRoiPercentage: 1.00,
          returnCapMultiplier: 2.0,
          burnPercentage: 80,
          liquidityPercentage: 20,
        },
        {
          minUsdt: 1000,
          maxUsdt: 4999,
          tierTitle: "Tier 2 ($1,000 - $4,999)",
          dailyRoiPercentage: 1.00,
          returnCapMultiplier: 2.5,
          burnPercentage: 80,
          liquidityPercentage: 20,
        },
        {
          minUsdt: 5000,
          maxUsdt: null,
          tierTitle: "Tier 3 ($5,000+)",
          dailyRoiPercentage: 1.00,
          returnCapMultiplier: 3.0,
          burnPercentage: 80,
          liquidityPercentage: 20,
        },
      ],
    };
  }

  public static stakeADS(
    userAddress: string,
    amount: number,
    periodDays: number,
    referrer?: string,
    txHash?: string
  ): AdsStakeRecord {
    if (amount <= 0) throw new Error("Stake amount must be greater than 0");

    let dailyRoiBps = 20; // 0.2%
    if (periodDays === 30) dailyRoiBps = 40;
    else if (periodDays === 90) dailyRoiBps = 60;
    else if (periodDays === 180) dailyRoiBps = 80;
    else if (periodDays === 360) dailyRoiBps = 100;
    else if (periodDays !== 0) throw new Error("Invalid staking period: must be 0, 30, 90, 180, or 360");

    const user = db.getOrCreateUser(userAddress, referrer);
    const now = Date.now();
    const maturityTime = periodDays === 0 ? 0 : now + periodDays * 86400 * 1000;

    const stakeRecord: AdsStakeRecord = {
      id: "ads_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      userAddress: user.address,
      amount,
      periodDays,
      dailyRoiBps,
      startTime: now,
      maturityTime,
      claimedRewards: 0,
      lastRoiCreditTime: now,
      isMatured: false,
      status: "ACTIVE",
      txHash,
    };

    db.addAdsStake(stakeRecord);

    user.totalStakedAds += amount;
    if (!user.participantSince) {
      user.participantSince = now;
    }
    // Participant qualification: at least 50% staked for 7 days
    if (Date.now() - user.participantSince >= 7 * 86400 * 1000) {
      user.isParticipant = true;
    }
    db.updateUser(user);

    return stakeRecord;
  }

  public static stakeUSDT(
    userAddress: string,
    amountUsdt: number,
    referrer?: string,
    txHash?: string
  ): UsdtStakeRecord {
    if (amountUsdt < 10) throw new Error("Minimum USDT stake is 10 USDT");

    let multiplier = 2.0;
    if (amountUsdt >= 5000) {
      multiplier = 3.0;
    } else if (amountUsdt >= 1000) {
      multiplier = 2.5;
    }

    const user = db.getOrCreateUser(userAddress, referrer);
    const now = Date.now();

    const stakeRecord: UsdtStakeRecord = {
      id: "usdt_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      userAddress: user.address,
      amountUsdt,
      dailyRoiRate: 0.01, // 1% daily
      maxMultiplier: multiplier,
      maxCapUsdt: amountUsdt * multiplier,
      claimedRewardsUsdt: 0,
      startTime: now,
      lastRoiCreditTime: now,
      status: "ACTIVE",
      txHash,
    };

    db.addUsdtStake(stakeRecord);

    user.totalStakedUsdt += amountUsdt;
    db.updateUser(user);

    return stakeRecord;
  }

  public static requestWithdrawal(
    userAddress: string,
    token: "ADS" | "USDT",
    amount: number
  ): WithdrawalRecord {
    const user = db.getUser(userAddress);
    if (!user) throw new Error("User not found");
    if (amount <= 0) throw new Error("Amount must be greater than 0");

    if (token === "ADS") {
      if (user.pendingAdsRewards < amount) {
        throw new Error(`Insufficient pending ADS rewards. Available: ${user.pendingAdsRewards}`);
      }
      user.pendingAdsRewards -= amount;
      user.totalAdsEarned += amount;
    } else {
      if (user.pendingUsdtRewards < amount) {
        throw new Error(`Insufficient pending USDT rewards. Available: ${user.pendingUsdtRewards}`);
      }
      user.pendingUsdtRewards -= amount;
      user.totalUsdtEarned += amount;
    }

    // 3% Base Tax routed to Ecosystem Treasury (Page 6, 7, 12)
    const taxAmount = amount * 0.03;
    const netAmount = amount - taxAmount;

    const withdrawal: WithdrawalRecord = {
      id: "wth_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      userAddress: user.address,
      token,
      grossAmount: amount,
      taxAmount,
      netAmount,
      status: "PROCESSED",
      timestamp: Date.now(),
    };

    db.addWithdrawal(withdrawal);
    db.updateUser(user);

    return withdrawal;
  }

  public static getUserDashboard(userAddress: string) {
    const user = db.getOrCreateUser(userAddress);
    const adsStakes = db.getAdsStakes(userAddress);
    const usdtStakes = db.getUsdtStakes(userAddress);
    const withdrawals = db.getWithdrawals(userAddress);
    const referralCommissions = db.getReferralCommissions(userAddress);
    const differentialBonuses = db.getDifferentialBonuses(userAddress);

    // Calculate participant status
    const isParticipant =
      user.totalStakedAds > 0 &&
      user.participantSince !== null &&
      Date.now() - user.participantSince >= 7 * 86400 * 1000;

    return {
      user: {
        address: user.address,
        referrerAddress: user.referrerAddress,
        totalStakedAds: user.totalStakedAds,
        totalStakedUsdt: user.totalStakedUsdt,
        pendingAdsRewards: user.pendingAdsRewards,
        pendingUsdtRewards: user.pendingUsdtRewards,
        totalAdsEarned: user.totalAdsEarned,
        totalUsdtEarned: user.totalUsdtEarned,
        isParticipant,
        communityTier: user.communityTier,
        dailySellLimitPercentage: isParticipant ? 10 : 3, // 10% vs 3% rolling 24h
      },
      adsStakes,
      usdtStakes,
      withdrawals,
      referralCommissionsCount: referralCommissions.length,
      differentialBonusesCount: differentialBonuses.length,
    };
  }
}
