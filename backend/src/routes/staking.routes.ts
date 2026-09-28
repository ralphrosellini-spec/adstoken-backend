import { Router } from "express";
import { StakingController } from "../controllers/staking.controller";

const router = Router();

// Staking Plans & Metadata
router.get("/plans", StakingController.getPlans);
router.post("/calculate", StakingController.calculate);

// User Authentication / Wallet Registration
router.post("/user/connect", StakingController.connectUser);
router.get("/user/:address/dashboard", StakingController.getUserDashboard);

// Staking Operations
router.post("/stake-ads", StakingController.stakeADS);
router.post("/stake-usdt", StakingController.stakeUSDT);
router.post("/withdraw", StakingController.withdraw);

// Referral & Tier System
router.get("/referrals/:address", StakingController.getReferrals);
router.get("/tiers/:address", StakingController.getTierInfo);

// Protocol Statistics & Ecosystem
router.get("/stats/ecosystem", StakingController.getEcosystemStats);

// Manual Admin Trigger for 0:01 AM UTC Distribution (for testing)
router.post("/admin/trigger-daily-distribution", StakingController.triggerDailyCron);

// TESTNET ONLY: Fast-forward N days of rewards instantly (simulates maturity & ROI for testing)
router.post("/admin/fast-forward-days", StakingController.triggerFastForward);

router.post('/admin/reset-user-data', StakingController.resetUserData);
router.post('/admin/add-test-downline', StakingController.addTestDownline);

export default router;
