import { Request, Response } from "express";
import { db } from "../services/db.service";
import { StakingService } from "../services/staking.service";
import { ReferralService } from "../services/referral.service";
import { TierService, TIER_CONFIGS } from "../services/tier.service";
import { CronService } from "../services/cron.service";

export class StakingController {
  public static async calculate(req: Request, res: Response) {
    try {
      const { token, amount, periodDays } = req.body;
      if (!token || amount === undefined) {
        return res.status(400).json({ success: false, error: "token and amount are required" });
      }
      const calculation = StakingService.calculateReward(
        token as "ADS" | "USDT",
        Number(amount),
        periodDays !== undefined ? Number(periodDays) : 0
      );
      res.json({ success: true, data: calculation });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async getPlans(req: Request, res: Response) {
    try {
      const plans = StakingService.getPlans();
      res.json({ success: true, data: plans });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async connectUser(req: Request, res: Response) {
    try {
      const { address, referrer } = req.body;
      if (!address) {
        return res.status(400).json({ success: false, error: "Address is required" });
      }
      const user = db.getOrCreateUser(address, referrer);
      res.json({ success: true, data: user });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getUserDashboard(req: Request, res: Response) {
    try {
      const { address } = req.params;
      const dashboard = StakingService.getUserDashboard(address);
      res.json({ success: true, data: dashboard });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async stakeADS(req: Request, res: Response) {
    try {
      const { address, amount, periodDays, referrer, txHash } = req.body;
      if (!address || amount === undefined || periodDays === undefined) {
        return res.status(400).json({
          success: false,
          error: "address, amount, and periodDays are required",
        });
      }

      const stake = StakingService.stakeADS(
        address,
        Number(amount),
        Number(periodDays),
        referrer,
        txHash
      );
      res.json({ success: true, data: stake });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async stakeUSDT(req: Request, res: Response) {
    try {
      const { address, amountUsdt, referrer, txHash } = req.body;
      if (!address || amountUsdt === undefined) {
        return res.status(400).json({
          success: false,
          error: "address and amountUsdt are required",
        });
      }

      const stake = StakingService.stakeUSDT(
        address,
        Number(amountUsdt),
        referrer,
        txHash
      );
      res.json({ success: true, data: stake });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async withdraw(req: Request, res: Response) {
    try {
      const { address, token, amount, withdrawSource } = req.body;
      if (!address || !token || amount === undefined) {
        return res.status(400).json({
          success: false,
          error: "address, token (ADS/USDT), and amount are required",
        });
      }

      const withdrawal = StakingService.requestWithdrawal(
        address,
        token,
        Number(amount),
        withdrawSource || "all"
      );
      res.json({ success: true, data: withdrawal });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public static async getReferrals(req: Request, res: Response) {
    try {
      const { address } = req.params;
      const direct = ReferralService.getDirectReferrals(address);
      const teamStats = ReferralService.getTeamStats(address);
      const commissions = db.getReferralCommissions(address);
      const detailedReport = ReferralService.getDetailedReferralTree(address);

      // Structured referral tree by level
      const l1Users = ReferralService.getDirectReferrals(address);
      const l2Users = ReferralService.getL2Referrals(address);
      const l3Users = ReferralService.getL3Referrals(address);

      res.json({
        success: true,
        data: {
          directReferrals: direct,
          teamStats,
          commissions,
          detailedReport,
          referralLevels: {
            l1: l1Users.map((u) => ({ address: u.address, referrerAddress: u.referrerAddress })),
            l2: l2Users.map((u) => ({ address: u.address, referrerAddress: u.referrerAddress })),
            l3: l3Users.map((u) => ({ address: u.address, referrerAddress: u.referrerAddress })),
          },
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getReferralLevel(req: Request, res: Response) {
    try {
      const { address, targetAddress } = req.params;
      const level = ReferralService.getReferralLevel(address, targetAddress);
      res.json({
        success: true,
        data: { sponsorAddress: address.toLowerCase(), targetAddress: targetAddress.toLowerCase(), level },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getTierInfo(req: Request, res: Response) {
    try {
      const { address } = req.params;
      const tierConfig = TierService.evaluateUserTier(address);
      const legVolumes = TierService.calculateLegVolumes(address);
      const bonuses = db.getDifferentialBonuses(address);

      const tiers = ["V1", "V2", "V3", "V4", "V5", "V6"] as const;
      const tierBreakdown = tiers.map((tier) => {
        const tierBonuses = bonuses.filter((b) => b.downlineTier === tier);
        return {
          tier,
          totalEarned: tierBonuses.reduce((acc, b) => acc + b.bonusAmount, 0),
          count: tierBonuses.length,
        };
      });

      const mappedBonuses = bonuses.map((b) => ({
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
      }));

      res.json({
        success: true,
        data: {
          currentTier: tierConfig.tier,
          bonusPercentage: tierConfig.bonusPercentage,
          weakLegVolume: legVolumes.weakLegVolume,
          strongLegVolume: legVolumes.strongLegVolume,
          totalVolume: legVolumes.totalVolume,
          tierRequirements: TIER_CONFIGS,
          differentialBonuses: mappedBonuses,
          tierBreakdown,
          totalTierEarned: bonuses.reduce((acc, b) => acc + b.bonusAmount, 0),
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async addTestDownline(req: Request, res: Response) {
    try {
      const { sponsorAddress, level, amount, token } = req.body;
      if (!sponsorAddress || !level || !amount) {
        return res.status(400).json({
          success: false,
          error: "sponsorAddress, level, and amount are required",
        });
      }
      const updatedReport = ReferralService.addTestDownline(
        sponsorAddress,
        Number(level) as 1 | 2 | 3,
        Number(amount),
        token || "USDT"
      );
      res.json({ success: true, data: updatedReport });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async resetUserData(req: Request, res: Response) {
    try {
      const { address } = req.body;
      if (address) {
        ReferralService.resetUserData(address);
      }
      res.json({ success: true, message: "User team data reset to default" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async getEcosystemStats(req: Request, res: Response) {
    try {
      const stats = db.getStats();
      const allUsers = db.getAllUsers();
      res.json({
        success: true,
        data: {
          ...stats,
          totalUsersCount: allUsers.length,
          participantUsersCount: allUsers.filter((u) => u.isParticipant).length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async triggerDailyCron(req: Request, res: Response) {
    try {
      const result = await CronService.runDailyDistribution();
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async triggerFastForward(req: Request, res: Response) {
    try {
      const days = parseInt(req.body.days);
      if (!days || days < 1 || days > 500) {
        return res.status(400).json({ success: false, error: "days must be between 1 and 500" });
      }
      const result = await CronService.fastForwardSimulation(days);
      res.json({ success: true, message: `Simulated ${days} days of rewards instantly!`, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
