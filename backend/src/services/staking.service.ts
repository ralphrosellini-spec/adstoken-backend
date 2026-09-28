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
    payoutToken: string;
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
          description: "Deposit USDT anytime. Tracked in ADS at $0.50. Withdraw principal and rewards anytime in ADS tokens.",
        },
        {
          periodDays: 30,
          title: "30 Days Locked",
          dailyRoiPercentage: 0.40,
          returnMultiplier: "0.40% Daily",
          description: "Lock for 30 days. Earn 0.40% daily. Capital returned at maturity in ADS tokens.",
        },
        {
          periodDays: 90,
          title: "90 Days Locked",
          dailyRoiPercentage: 0.60,
          returnMultiplier: "0.60% Daily",
          description: "Lock for 90 days. Earn 0.60% daily. Capital returned at maturity in ADS tokens.",
        },
        {
          periodDays: 180,
          title: "180 Days Locked",
          dailyRoiPercentage: 0.80,
          returnMultiplier: "0.80% Daily",
          description: "Lock for 180 days. Earn 0.80% daily. Capital returned at maturity in ADS tokens.",
        },
        {
          periodDays: 360,
          title: "360 Days Locked",
          dailyRoiPercentage: 1.00,
          returnMultiplier: "1.00% Daily",
          description: "Lock for 360 days. Top yield 1.00% daily. Capital returned at maturity in ADS tokens.",
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
          payoutToken: "ADS",
        },
        {
          minUsdt: 1000,
          maxUsdt: 4999,
          tierTitle: "Tier 2 ($1,000 - $4,999)",
          dailyRoiPercentage: 1.00,
          returnCapMultiplier: 2.5,
          burnPercentage: 80,
          liquidityPercentage: 20,
          payoutToken: "ADS",
        },
        {
          minUsdt: 5000,
          maxUsdt: null,
          tierTitle: "Tier 3 ($5,000+)",
          dailyRoiPercentage: 1.00,
          returnCapMultiplier: 3.0,
          burnPercentage: 80,
          liquidityPercentage: 20,
          payoutToken: "ADS",
        },
      ],
    };
  }

  public static stakeADS(
    userAddress: string,
    amount: number, // ADS tokens or USDT
    periodDays: number,
    referrer?: string,
    txHash?: string,
    usdtDeposited?: number
  ): AdsStakeRecord {
    if (amount <= 0 && (!usdtDeposited || usdtDeposited <= 0)) {
      throw new Error("Stake amount must be greater than 0");
    }

    let dailyRoiBps = 20; // 0.2%
    if (periodDays === 30) dailyRoiBps = 40;
    else if (periodDays === 90) dailyRoiBps = 60;
    else if (periodDays === 180) dailyRoiBps = 80;
    else if (periodDays === 360) dailyRoiBps = 100;
    else if (periodDays !== 0) throw new Error("Invalid staking period: must be 0, 30, 90, 180, or 360");

    const adsPrice = 0.50;
    const finalUsdtDeposited = usdtDeposited || (amount <= 500000 ? amount : amount * adsPrice);
    const finalAdsAmount = usdtDeposited ? usdtDeposited / adsPrice : amount;

    const user = db.getOrCreateUser(userAddress, referrer);
    const now = Date.now();
    const maturityTime = periodDays === 0 ? 0 : now + periodDays * 86400 * 1000;

    const stakeRecord: AdsStakeRecord = {
      id: "ads_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      userAddress: user.address,
      amount: finalAdsAmount,
      usdtDeposited: finalUsdtDeposited,
      adsEntryPrice: adsPrice,
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

    user.totalStakedAds += finalAdsAmount;
    if (!user.participantSince) {
      user.participantSince = now;
    }
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
      adsEntryPrice: 0.50,
      dailyRoiRate: 0.01, // 1% daily
      maxMultiplier: multiplier,
      maxCapUsdt: amountUsdt * multiplier,
      claimedRewardsUsdt: 0,
      claimedRewardsAds: 0,
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
    amount: number,
    withdrawSource: "all" | "daily" | "referral" = "all"
  ): WithdrawalRecord {
    const user = db.getUser(userAddress);
    if (!user) throw new Error("User not found");
    if (amount <= 0) throw new Error("Amount must be greater than 0");

    const isTestnet1Min = process.env.TESTNET_1MIN !== "false";
    const secondsPerDay = isTestnet1Min ? 60 : 86400;
    const now = Date.now();

    if (token === "ADS") {
      // 1. If including daily staking rewards, settle accrued on-chain / stake records
      if (withdrawSource === "all" || withdrawSource === "daily") {
        const adsStakes = db.getAdsStakes(userAddress);
        for (const stake of adsStakes) {
          if (stake.status !== "ACTIVE" || stake.isMatured) continue;
          const endTime = (stake.periodDays > 0 && now > stake.maturityTime) ? stake.maturityTime : now;
          if (endTime > stake.lastRoiCreditTime) {
            const elapsedSec = (endTime - stake.lastRoiCreditTime) / 1000;
            const completedDays = Math.floor(elapsedSec / secondsPerDay);
            if (completedDays > 0) {
              const dailyReward = (stake.amount * stake.dailyRoiBps) / 10000;
              const accrued = dailyReward * completedDays;
              stake.claimedRewards += accrued;
              stake.lastRoiCreditTime += completedDays * secondsPerDay * 1000;
              if (stake.periodDays > 0 && now >= stake.maturityTime) {
                stake.isMatured = true;
              }
              db.updateAdsStake(stake);
            }
          }
        }
      }

      // 2. If including referral rewards, deduct from pending referral balance
      if (withdrawSource === "all") {
        user.pendingAdsRewards = 0;
      } else if (withdrawSource === "referral") {
        user.pendingAdsRewards = Math.max(0, Number((user.pendingAdsRewards - amount).toFixed(8)));
      }

      user.totalAdsEarned += amount;
    } else {
      // USDT
      if (withdrawSource === "all" || withdrawSource === "daily") {
        const usdtStakes = db.getUsdtStakes(userAddress);
        for (const stake of usdtStakes) {
          if (stake.status !== "ACTIVE") continue;
          if (now > stake.lastRoiCreditTime) {
            const elapsedSec = (now - stake.lastRoiCreditTime) / 1000;
            const completedDays = Math.floor(elapsedSec / secondsPerDay);
            if (completedDays > 0) {
              const dailyReward = stake.amountUsdt * 0.01;
              const rawPending = dailyReward * completedDays;
              const remainingCap = stake.maxCapUsdt > stake.claimedRewardsUsdt ? stake.maxCapUsdt - stake.claimedRewardsUsdt : 0;
              const accrued = Math.min(rawPending, remainingCap);
              stake.claimedRewardsUsdt += accrued;
              stake.lastRoiCreditTime += completedDays * secondsPerDay * 1000;
              if (stake.claimedRewardsUsdt >= stake.maxCapUsdt) {
                stake.status = "COMPLETED";
              }
              db.updateUsdtStake(stake);
            }
          }
        }
      }

      if (withdrawSource === "all") {
        user.pendingUsdtRewards = 0;
      } else if (withdrawSource === "referral") {
        user.pendingUsdtRewards = Math.max(0, Number((user.pendingUsdtRewards - amount).toFixed(8)));
      }

      user.totalUsdtEarned += amount;
    }

    // 3% Base Tax routed to Ecosystem Treasury (Page 6, 7, 12)
    const taxAmount = amount * 0.03;
    const netAmount = amount - taxAmount;

    const withdrawal: WithdrawalRecord = {
      id: "wth_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      userAddress: user.address,
      token, // ADS for ADS rewards, USDT for USDT rewards!
      grossAmount: Number(amount.toFixed(4)),
      taxAmount: Number(taxAmount.toFixed(4)),
      netAmount: Number(netAmount.toFixed(4)),
      payoutToken: token,
      status: "PROCESSED",
      timestamp: Date.now(),
    };

    db.addWithdrawal(withdrawal);
    db.updateUser(user);

    return withdrawal;
  }

  public static calculateReward(
    token: "ADS" | "USDT",
    amount: number,
    periodDays: number = 0
  ) {
    const isTestnet1Min = process.env.TESTNET_1MIN !== "false";
    const secondsPerDay = isTestnet1Min ? 60 : 86400;
    const adsPrice = 0.50; // 1 USDT = 2 ADS ($0.50)

    if (token === "ADS") {
      let dailyRoiBps = 20; // 0.20%
      if (periodDays === 30) dailyRoiBps = 40;
      else if (periodDays === 90) dailyRoiBps = 60;
      else if (periodDays === 180) dailyRoiBps = 80;
      else if (periodDays === 360) dailyRoiBps = 100;

      // User enters USDT deposit amount
      const usdtDeposited = amount;
      const trackedAdsAmount = usdtDeposited / adsPrice; // e.g. $1,000 USDT = 2,000 ADS

      const dailyRoiPercentage = dailyRoiBps / 100;
      const dailyRewardAds = (trackedAdsAmount * dailyRoiBps) / 10000;
      const dailyRewardUsdt = dailyRewardAds * adsPrice;
      const rewardPerMinuteTestnet = (dailyRewardAds * 60) / secondsPerDay;
      const rewardPerSecond = dailyRewardAds / secondsPerDay;
      const totalPeriodRewardAds = periodDays > 0 ? dailyRewardAds * periodDays : null;
      const totalPeriodRewardUsdt = totalPeriodRewardAds ? totalPeriodRewardAds * adsPrice : null;

      return {
        token: "ADS",
        usdtDeposited,
        stakedAmount: trackedAdsAmount,
        adsPrice,
        periodDays,
        dailyRoiBps,
        dailyRoiPercentage,
        dailyRewardTokens: Number(dailyRewardAds.toFixed(4)),
        dailyRewardUsdt: Number(dailyRewardUsdt.toFixed(4)),
        rewardPerMinuteTestnet: Number(rewardPerMinuteTestnet.toFixed(4)),
        rewardPerSecond: Number(rewardPerSecond.toFixed(6)),
        totalPeriodRewardTokens: totalPeriodRewardAds ? Number(totalPeriodRewardAds.toFixed(2)) : null,
        totalPeriodRewardUsdt: totalPeriodRewardUsdt ? Number(totalPeriodRewardUsdt.toFixed(2)) : null,
        capitalReturnedAtMaturity: true,
        payoutCurrency: "ADS Tokens",
      };
    } else {
      // USDT Staking (1% daily, 2x/2.5x/3x caps, converted to ADS at withdrawal)
      let multiplier = 2.0;
      let capTier = "$10 - $999 (2X)";
      if (amount >= 5000) {
        multiplier = 3.0;
        capTier = "$5,000+ (3X)";
      } else if (amount >= 1000) {
        multiplier = 2.5;
        capTier = "$1,000 - $4,999 (2.5X)";
      }

      const dailyRoiPercentage = 1.00;
      const dailyRewardUsdt = amount * 0.01;
      const rewardPerMinuteTestnet = (dailyRewardUsdt * 60) / secondsPerDay;
      const rewardPerSecond = dailyRewardUsdt / secondsPerDay;
      const maxCapUsdt = amount * multiplier;
      const daysToCap = Math.ceil(maxCapUsdt / dailyRewardUsdt);

      return {
        token: "USDT",
        stakedAmount: amount,
        dailyRoiPercentage,
        dailyRewardUsdt: Number(dailyRewardUsdt.toFixed(4)),
        rewardPerMinuteTestnet: Number(rewardPerMinuteTestnet.toFixed(4)),
        rewardPerSecond: Number(rewardPerSecond.toFixed(6)),
        maxMultiplier: multiplier,
        capTier,
        maxCapUsdt: Number(maxCapUsdt.toFixed(2)),
        daysToCap,
        buyBurnAllocationUsdt: Number((amount * 0.80).toFixed(2)),
        liquidityAllocationUsdt: Number((amount * 0.20).toFixed(2)),
        payoutCurrency: "USDT",
      };
    }
  }

  public static getUserDashboard(userAddress: string) {
    const user = db.getOrCreateUser(userAddress);
    const adsStakes = db.getAdsStakes(userAddress);
    const usdtStakes = db.getUsdtStakes(userAddress);
    const withdrawals = db.getWithdrawals(userAddress);
    const referralCommissions = db.getReferralCommissions(userAddress);
    const differentialBonuses = db.getDifferentialBonuses(userAddress);

    const isTestnet1Min = process.env.TESTNET_1MIN !== "false";
    const secondsPerDay = isTestnet1Min ? 60 : 86400;
    const now = Date.now();
    const adsPrice = 0.50;

    // Dynamically calculate pending ADS rewards (Credited ONLY after full completed period/day)
    let liveAccruedAds = 0;
    for (const stake of adsStakes) {
      if (stake.status !== "ACTIVE" || stake.isMatured) continue;
      const endTime = (stake.periodDays > 0 && now > stake.maturityTime) ? stake.maturityTime : now;
      if (endTime > stake.lastRoiCreditTime) {
        const elapsedSec = (endTime - stake.lastRoiCreditTime) / 1000;
        const completedDays = Math.floor(elapsedSec / secondsPerDay);
        if (completedDays > 0) {
          const dailyReward = (stake.amount * stake.dailyRoiBps) / 10000;
          liveAccruedAds += dailyReward * completedDays;
        }
      }
    }

    // Dynamically calculate pending USDT rewards (Credited ONLY after full completed period/day)
    let liveAccruedUsdt = 0;
    let liveAccruedUsdtInAds = 0;
    for (const stake of usdtStakes) {
      if (stake.status !== "ACTIVE") continue;
      if (now > stake.lastRoiCreditTime) {
        const elapsedSec = (now - stake.lastRoiCreditTime) / 1000;
        const completedDays = Math.floor(elapsedSec / secondsPerDay);
        if (completedDays > 0) {
          const dailyReward = stake.amountUsdt * 0.01;
          const rawPending = dailyReward * completedDays;
          const remainingCap = stake.maxCapUsdt > stake.claimedRewardsUsdt ? stake.maxCapUsdt - stake.claimedRewardsUsdt : 0;
          const accrued = Math.min(rawPending, remainingCap);
          liveAccruedUsdt += accrued;
          liveAccruedUsdtInAds += accrued / adsPrice;
        }
      }
    }

    const referralAdsPending = Number(user.pendingAdsRewards.toFixed(4));
    const referralUsdtPending = Number(user.pendingUsdtRewards.toFixed(4));
    const dailyStakingAdsPending = Number(liveAccruedAds.toFixed(4));
    const dailyStakingUsdtPending = Number(liveAccruedUsdt.toFixed(4));

    const pendingAdsRewards = Number((user.pendingAdsRewards + liveAccruedAds).toFixed(4));
    const pendingUsdtRewards = Number((user.pendingUsdtRewards + liveAccruedUsdt).toFixed(4));
    const pendingUsdtRewardsInAds = Number(((pendingUsdtRewards / adsPrice)).toFixed(4));

    // Calculate participant status
    const isParticipant =
      (user.totalStakedAds > 0 || user.totalStakedUsdt > 0) &&
      user.participantSince !== null &&
      Date.now() - user.participantSince >= 7 * 86400 * 1000;

    return {
      user: {
        address: user.address,
        referrerAddress: user.referrerAddress,
        totalStakedAds: user.totalStakedAds,
        totalStakedUsdt: user.totalStakedUsdt,
        pendingAdsRewards,
        pendingUsdtRewards,
        pendingUsdtRewardsInAds,
        dailyStakingPendingAds: dailyStakingAdsPending,
        dailyStakingPendingUsdt: dailyStakingUsdtPending,
        referralPendingAds: referralAdsPending,
        referralPendingUsdt: referralUsdtPending,
        totalAdsEarned: user.totalAdsEarned,
        totalUsdtEarned: user.totalUsdtEarned,
        isParticipant,
        communityTier: user.communityTier,
        dailySellLimitPercentage: isParticipant ? 10 : 3,
      },
      rewardBreakdown: {
        ads: {
          dailyStakingPending: dailyStakingAdsPending,
          referralPending: referralAdsPending,
          totalPending: pendingAdsRewards,
        },
        usdt: {
          dailyStakingPending: dailyStakingUsdtPending,
          referralPending: referralUsdtPending,
          totalPending: pendingUsdtRewards,
        },
      },
      adsStakes,
      usdtStakes,
      withdrawals,
      activePlansCount: adsStakes.filter(s => s.status === "ACTIVE" && !s.isMatured).length + usdtStakes.filter(s => s.status === "ACTIVE").length,
      referralCommissionsCount: referralCommissions.length,
      differentialBonusesCount: differentialBonuses.length,
    };
  }
}

