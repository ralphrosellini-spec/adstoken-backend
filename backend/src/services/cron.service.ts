import cron from "node-cron";
import { db } from "./db.service";
import { ReferralService } from "./referral.service";
import { TierService } from "./tier.service";
import { roundFinancial } from "../config/business-rules";

export class CronService {
  private static isRunning = false;

  /**
   * Initializes the cron scheduled at 0:01 AM UTC every day:
   */
  public static init() {
    const isTestnet1Min = process.env.TESTNET_1MIN !== "false" || process.env.TEST_CRON_1MIN === "true";
    const scheduleExpr = isTestnet1Min ? "* * * * *" : "1 0 * * *";
    cron.schedule(scheduleExpr, async () => {
      console.log(`[CRON] [${scheduleExpr === "* * * * *" ? "1-MIN TEST" : "0:01 AM UTC"}] Starting staking reward distribution...`);
      await this.runDailyDistribution();
    }, {
      timezone: "Etc/UTC"
    });

    console.log(`[CRON] Scheduled ROI credit job with schedule: ${scheduleExpr} (1 day = 1 min testing supported)`);
  }

  /**
   * Core logic for daily ROI distribution. Can also be triggered manually via API for testing.
   */
  public static async runDailyDistribution(): Promise<{
    processedAdsStakes: number;
    totalAdsEmitted: number;
    processedUsdtStakes: number;
    totalUsdtEmitted: number;
    referralCommissionsIssued: number;
    differentialBonusesIssued: number;
  }> {
    if (this.isRunning) {
      console.warn("[CRON] Daily distribution already in progress. Skipping.");
      return {
        processedAdsStakes: 0,
        totalAdsEmitted: 0,
        processedUsdtStakes: 0,
        totalUsdtEmitted: 0,
        referralCommissionsIssued: 0,
        differentialBonusesIssued: 0,
      };
    }

    this.isRunning = true;
    console.log("[CRON] Executing daily ROI calculations at:", new Date().toISOString());

    let processedAdsStakes = 0;
    let totalAdsEmitted = 0;
    let processedUsdtStakes = 0;
    let totalUsdtEmitted = 0;
    let referralCommissionsIssued = 0;
    let differentialBonusesIssued = 0;

    const isTestnet1Min = process.env.TESTNET_1MIN !== "false";
    const periodUnitMs = isTestnet1Min ? 60 * 1000 : 86400 * 1000;
    const now = Date.now();
    const currentPeriodIndex = Math.floor(now / periodUnitMs);

    try {
      // 1. Process ADS Stakes
      const adsStakes = db.getAdsStakes();
      for (const stake of adsStakes) {
        if (stake.status !== "ACTIVE" || stake.isMatured) continue;

        const user = db.getUser(stake.userAddress);
        if (!user) continue;

        // Daily ROI: (amount * dailyRoiBps) / 10000
        const dailyRoi = roundFinancial((stake.amount * stake.dailyRoiBps) / 10000, 6);
        if (dailyRoi <= 0) continue;

        stake.claimedRewards = roundFinancial(stake.claimedRewards + dailyRoi, 6);
        stake.lastRoiCreditTime = now;

        // Check if matured (for fixed term)
        if (stake.periodDays > 0 && now >= stake.maturityTime) {
          stake.isMatured = true;
        }

        user.pendingAdsRewards = roundFinancial(user.pendingAdsRewards + dailyRoi, 4);
        totalAdsEmitted = roundFinancial(totalAdsEmitted + dailyRoi, 6);
        processedAdsStakes++;

        db.updateAdsStake(stake);
        db.updateUser(user);

        // Deterministic event ID for this reward calculation period
        const eventId = `ads_${stake.id}_p${currentPeriodIndex}`;

        // Process 3-level referral commissions on the daily reward
        const refComms = ReferralService.processReferralCommissions(user.address, dailyRoi, "ADS", eventId);
        referralCommissionsIssued += refComms.length;

        // Process Community Tier differential bonuses
        const diffBonuses = TierService.distributeDifferentialBonusesForReward(user.address, dailyRoi, eventId);
        differentialBonusesIssued += diffBonuses.length;
      }

      // 2. Process USDT Stakes (1% daily up to 2x / 2.5x / 3x cap)
      const usdtStakes = db.getUsdtStakes();
      for (const stake of usdtStakes) {
        if (stake.status !== "ACTIVE") continue;

        const user = db.getUser(stake.userAddress);
        if (!user) continue;

        // 1% daily
        const dailyRoi = roundFinancial(stake.amountUsdt * 0.01, 6);
        const remainingCap = roundFinancial(stake.maxCapUsdt - stake.claimedRewardsUsdt, 6);

        if (remainingCap <= 0) {
          stake.status = "COMPLETED";
          db.updateUsdtStake(stake);
          continue;
        }

        const payout = dailyRoi > remainingCap ? remainingCap : dailyRoi;
        stake.claimedRewardsUsdt = roundFinancial(stake.claimedRewardsUsdt + payout, 6);
        stake.lastRoiCreditTime = now;

        if (stake.claimedRewardsUsdt >= stake.maxCapUsdt) {
          stake.status = "COMPLETED";
        }

        user.pendingUsdtRewards = roundFinancial(user.pendingUsdtRewards + payout, 4);
        totalUsdtEmitted = roundFinancial(totalUsdtEmitted + payout, 6);
        processedUsdtStakes++;

        db.updateUsdtStake(stake);
        db.updateUser(user);

        const eventId = `usdt_${stake.id}_p${currentPeriodIndex}`;

        // Process 3-level referral commissions
        const refComms = ReferralService.processReferralCommissions(user.address, payout, "USDT", eventId);
        referralCommissionsIssued += refComms.length;

        // Process Community Tier differential bonuses
        const diffBonuses = TierService.distributeDifferentialBonusesForReward(user.address, payout, eventId);
        differentialBonusesIssued += diffBonuses.length;
      }

      // 3. Update Community Tiers (V1-V6) for all users
      const allUsers = db.getAllUsers();
      for (const user of allUsers) {
        TierService.evaluateUserTier(user.address);
      }

      db.setLastCronRunAt(now);
      console.log(`[CRON] Finished distribution. ADS emitted: ${totalAdsEmitted}, USDT emitted: ${totalUsdtEmitted}, RefComms: ${referralCommissionsIssued}, DiffBonuses: ${differentialBonusesIssued}`);
    } finally {
      this.isRunning = false;
    }

    return {
      processedAdsStakes,
      totalAdsEmitted,
      processedUsdtStakes,
      totalUsdtEmitted,
      referralCommissionsIssued,
      differentialBonusesIssued,
    };
  }

  /**
   * Fast-forward N days of reward cycles instantly for testing purposes.
   * e.g. pass days=30 to instantly simulate 30 days of ROI, referrals, and tier re-evaluation.
   */
  public static async fastForwardSimulation(days: number): Promise<{
    daysSimulated: number;
    totalEmittedAds: number;
    totalEmittedUsdt: number;
    totalRefComms: number;
    totalDiffBonuses: number;
  }> {
    let totalEmittedAds = 0;
    let totalEmittedUsdt = 0;
    let totalRefComms = 0;
    let totalDiffBonuses = 0;

    for (let i = 0; i < days; i++) {
      const res = await this.runDailyDistribution();
      totalEmittedAds = roundFinancial(totalEmittedAds + res.totalAdsEmitted, 4);
      totalEmittedUsdt = roundFinancial(totalEmittedUsdt + res.totalUsdtEmitted, 4);
      totalRefComms += res.referralCommissionsIssued;
      totalDiffBonuses += res.differentialBonusesIssued;
    }

    return {
      daysSimulated: days,
      totalEmittedAds,
      totalEmittedUsdt,
      totalRefComms,
      totalDiffBonuses,
    };
  }
}
