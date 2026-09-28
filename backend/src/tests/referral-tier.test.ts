/**
 * Comprehensive Automated Test Suite for Referral Commission System (L1, L2, L3)
 * and Community Tier System (V1 to V6).
 *
 * Implements Tests A through Q per Specification Section 21.
 */

import { db } from "../services/db.service";
import { ReferralService } from "../services/referral.service";
import { TierService, TIER_CONFIGS } from "../services/tier.service";
import { StakingService } from "../services/staking.service";
import {
  REFERRAL_RATES,
  REFERRAL_ELIGIBILITY,
  COMMUNITY_TIER_CONFIGS,
  roundFinancial,
  getPersonalStakingUsd,
} from "../config/business-rules";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${detail ? "- " + detail : ""}`);
    testsFailed++;
  }
}

function assertEqual<T>(actual: T, expected: T, testName: string) {
  if (actual === expected) {
    console.log(`  ✅ PASS: ${testName} (Value: ${actual})`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} - Expected: ${expected}, Got: ${actual}`);
    testsFailed++;
  }
}

async function runTestSuite() {
  console.log("\n=======================================================");
  console.log("🚀 STARTING REFERRAL & COMMUNITY TIER TEST SUITE (A-Q)");
  console.log("=======================================================\n");

  const runId = Date.now();

  // Helper to create test user in isolated space
  const createTestUser = (address: string, referrer: string | null, stakedUsdt: number = 0, stakedAds: number = 0) => {
    const u = db.getOrCreateUser(address, referrer || undefined);
    u.totalStakedUsdt = stakedUsdt;
    u.totalStakedAds = stakedAds;
    db.updateUser(u);
    return u;
  };

  // -------------------------------------------------------------------
  // TEST A: REFERRAL HIERARCHY
  // Exact Structure from Specification:
  // A -> B
  // B -> C, B -> D
  // C -> E, C -> F
  // D -> X
  // -------------------------------------------------------------------
  console.log("\n--- TEST A: REFERRAL HIERARCHY ---");
  const a = "0xa000000000000000000000000000000000000001";
  const b = "0xb000000000000000000000000000000000000002";
  const c = "0xc000000000000000000000000000000000000003";
  const d = "0xd000000000000000000000000000000000000004";
  const e = "0xe000000000000000000000000000000000000005";
  const f = "0xf000000000000000000000000000000000000006";
  const x = "0xa000000000000000000000000000000000000007";

  createTestUser(a, null, 500, 0);
  createTestUser(b, a, 500, 0);
  createTestUser(c, b, 500, 0);
  createTestUser(d, b, 500, 0);
  createTestUser(e, c, 500, 0);
  createTestUser(f, c, 500, 0);
  createTestUser(x, d, 500, 0);

  const treeA = ReferralService.getReferralLevels(a);
  const l1AddrsA = treeA.l1.map((u) => u.address.toLowerCase());
  const l2AddrsA = treeA.l2.map((u) => u.address.toLowerCase());
  const l3AddrsA = treeA.l3.map((u) => u.address.toLowerCase());

  assert(l1AddrsA.includes(b.toLowerCase()) && l1AddrsA.length === 1, "Sponsor A: L1 is [B]");
  assert(l2AddrsA.includes(c.toLowerCase()) && l2AddrsA.includes(d.toLowerCase()) && l2AddrsA.length === 2, "Sponsor A: L2 is [C, D]");
  assert(
    l3AddrsA.includes(e.toLowerCase()) &&
    l3AddrsA.includes(f.toLowerCase()) &&
    l3AddrsA.includes(x.toLowerCase()) &&
    l3AddrsA.length === 3,
    "Sponsor A: L3 is [E, F, X]"
  );

  const treeB = ReferralService.getReferralLevels(b);
  const l1AddrsB = treeB.l1.map((u) => u.address.toLowerCase());
  const l2AddrsB = treeB.l2.map((u) => u.address.toLowerCase());

  assert(l1AddrsB.includes(c.toLowerCase()) && l1AddrsB.includes(d.toLowerCase()) && l1AddrsB.length === 2, "Sponsor B: L1 is [C, D]");
  assert(
    l2AddrsB.includes(e.toLowerCase()) &&
    l2AddrsB.includes(f.toLowerCase()) &&
    l2AddrsB.includes(x.toLowerCase()) &&
    l2AddrsB.length === 3,
    "Sponsor B: L2 is [E, F, X]"
  );
  assertEqual(treeB.l3.length, 0, "Sponsor B: L3 is empty");

  const treeC = ReferralService.getReferralLevels(c);
  assertEqual(treeC.l1.length, 2, "Sponsor C: L1 has 2 members [E, F]");
  assertEqual(treeC.l2.length, 0, "Sponsor C: L2 has 0 members");

  const treeD = ReferralService.getReferralLevels(d);
  assertEqual(treeD.l1.length, 1, "Sponsor D: L1 has 1 member [X]");
  assertEqual(treeD.l1[0].address.toLowerCase(), x.toLowerCase(), "Sponsor D: L1 member is X");

  // -------------------------------------------------------------------
  // TEST B: L1 COMMISSION (10%)
  // -------------------------------------------------------------------
  console.log("\n--- TEST B: L1 COMMISSION ---");
  const testEarner = "0x1111111111111111111111111111111111111111";
  const testSponsorL1 = "0x2222222222222222222222222222222222222222";
  createTestUser(testSponsorL1, null, 200, 0); // personal stake $200 >= $100
  createTestUser(testEarner, testSponsorL1, 200, 0); // direct referral stake $200 >= $100

  const commsL1 = ReferralService.processReferralCommissions(testEarner, 100, "USDT", `test_b_event_${runId}`);
  const recL1 = commsL1.find((c) => c.recipientAddress.toLowerCase() === testSponsorL1.toLowerCase() && c.level === 1);
  assert(recL1 !== undefined, "L1 commission record generated");
  if (recL1) {
    assertEqual(recL1.commissionPercentage, 10, "L1 commission rate is 10%");
    assertEqual(recL1.commissionAmount, 10, "100 USDT * 10% = 10 USDT commission");
  }

  // -------------------------------------------------------------------
  // TEST C: L2 COMMISSION (3%)
  // -------------------------------------------------------------------
  console.log("\n--- TEST C: L2 COMMISSION ---");
  const testSponsorL2 = "0x3333333333333333333333333333333333333333";
  const testMid1 = "0x4444444444444444444444444444444444444444";
  const testMid2 = "0x5555555555555555555555555555555555555555";
  const testDownlineL2 = "0x6666666666666666666666666666666666666666";

  createTestUser(testSponsorL2, null, 200, 0); // Sponsor personal $200
  createTestUser(testMid1, testSponsorL2, 300, 0); // Active direct 1
  createTestUser(testMid2, testSponsorL2, 300, 0); // Active direct 2 (team vol = 600 >= 500)
  createTestUser(testDownlineL2, testMid1, 100, 0); // Downline of Mid1 -> L2 of SponsorL2

  const commsL2 = ReferralService.processReferralCommissions(testDownlineL2, 100, "USDT", `test_c_event_${runId}`);
  const recL2 = commsL2.find((c) => c.recipientAddress.toLowerCase() === testSponsorL2.toLowerCase() && c.level === 2);
  assert(recL2 !== undefined, "L2 commission record generated");
  if (recL2) {
    assertEqual(recL2.commissionPercentage, 3, "L2 commission rate is 3%");
    assertEqual(recL2.commissionAmount, 3, "100 USDT * 3% = 3 USDT commission");
  }

  // -------------------------------------------------------------------
  // TEST D: L3 COMMISSION (2%)
  // -------------------------------------------------------------------
  console.log("\n--- TEST D: L3 COMMISSION ---");
  const testSponsorL3 = "0x7777777777777777777777777777777777777777";
  const testL1_1 = "0x8888888888888888888888888888888888888881";
  const testL1_2 = "0x8888888888888888888888888888888888888882";
  const testL1_3 = "0x8888888888888888888888888888888888888883";
  const testL2_1 = "0x9999999999999999999999999999999999999991";
  const testL3_Earner = "0x9999999999999999999999999999999999999992";

  createTestUser(testSponsorL3, null, 200, 0); // Sponsor personal $200
  createTestUser(testL1_1, testSponsorL3, 400, 0); // Active direct 1
  createTestUser(testL1_2, testSponsorL3, 400, 0); // Active direct 2
  createTestUser(testL1_3, testSponsorL3, 400, 0); // Active direct 3 (team vol = 1200 >= 1000)
  createTestUser(testL2_1, testL1_1, 200, 0); // L2
  createTestUser(testL3_Earner, testL2_1, 200, 0); // L3

  const commsL3 = ReferralService.processReferralCommissions(testL3_Earner, 100, "USDT", `test_d_event_${runId}`);
  const recL3 = commsL3.find((c) => c.recipientAddress.toLowerCase() === testSponsorL3.toLowerCase() && c.level === 3);
  assert(recL3 !== undefined, "L3 commission record generated");
  if (recL3) {
    assertEqual(recL3.commissionPercentage, 2, "L3 commission rate is 2%");
    assertEqual(recL3.commissionAmount, 2, "100 USDT * 2% = 2 USDT commission");
  }

  // -------------------------------------------------------------------
  // TEST E: ZERO REWARD
  // -------------------------------------------------------------------
  console.log("\n--- TEST E: ZERO REWARD ---");
  const commsZero = ReferralService.processReferralCommissions(testEarner, 0, "USDT", `test_e_event_${runId}`);
  assertEqual(commsZero.length, 0, "Zero reward produces zero commission records");

  // -------------------------------------------------------------------
  // TEST F: INELIGIBLE SPONSOR
  // -------------------------------------------------------------------
  console.log("\n--- TEST F: INELIGIBLE SPONSOR ---");
  const ineligSponsor = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const ineligEarner = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  // Sponsor only staked $50 (< $100 requirement)
  createTestUser(ineligSponsor, null, 50, 0);
  createTestUser(ineligEarner, ineligSponsor, 500, 0);

  const commsInelig = ReferralService.processReferralCommissions(ineligEarner, 100, "USDT", `test_f_event_${runId}`);
  const foundInelig = commsInelig.find((c) => c.recipientAddress.toLowerCase() === ineligSponsor.toLowerCase());
  assertEqual(foundInelig, undefined, "Ineligible sponsor with < $100 personal stake receives 0 commission");

  // -------------------------------------------------------------------
  // TEST G: REFERRAL DEPTH (L4 produces no commission)
  // -------------------------------------------------------------------
  console.log("\n--- TEST G: REFERRAL DEPTH ---");
  const l4User = "0xcccccccccccccccccccccccccccccccccccccccc";
  createTestUser(l4User, testL3_Earner, 100, 0); // L4 relative to testSponsorL3
  const commsL4 = ReferralService.processReferralCommissions(l4User, 100, "USDT", `test_g_event_${runId}`);
  const recL4 = commsL4.find((c) => c.recipientAddress.toLowerCase() === testSponsorL3.toLowerCase());
  assertEqual(recL4, undefined, "User at L4 produces no commission for root sponsor");

  // -------------------------------------------------------------------
  // TEST H: COMMUNITY TIER QUALIFICATION (V1 TO V6)
  // -------------------------------------------------------------------
  console.log("\n--- TEST H: COMMUNITY TIER QUALIFICATION ---");
  const tierUser = "0xdddddddddddddddddddddddddddddddddddddddd";
  const tierDownline = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  createTestUser(tierUser, null, 0, 0);
  createTestUser(tierDownline, tierUser, 0, 0);

  // V0: 0 personal, 0 team
  let tierResult = TierService.evaluateUserTier(tierUser);
  assertEqual(tierResult.tier, "V0", "0 personal + 0 team qualifies as V0");

  // Insufficient team volume for V1 (e.g. 100 personal, 4,999 team)
  createTestUser(tierUser, null, 100, 0);
  createTestUser(tierDownline, tierUser, 4999, 0);
  tierResult = TierService.evaluateUserTier(tierUser);
  assertEqual(tierResult.tier, "V0", "100 personal + 4,999 team is below V1 threshold (V0)");

  // Insufficient personal stake for V1 (e.g. 99 personal, 50,000 team)
  createTestUser(tierUser, null, 99, 0);
  createTestUser(tierDownline, tierUser, 50000, 0);
  tierResult = TierService.evaluateUserTier(tierUser);
  assertEqual(tierResult.tier, "V0", "99 personal + 50,000 team is below V1 personal threshold (V0)");

  // Exact V1: 100 personal, 5,000 team
  createTestUser(tierUser, null, 100, 0);
  createTestUser(tierDownline, tierUser, 5000, 0);
  tierResult = TierService.evaluateUserTier(tierUser);
  assertEqual(tierResult.tier, "V1", "Exact 100 personal + 5,000 team qualifies as V1");

  // Exact V2: 500 personal, 20,000 team
  createTestUser(tierUser, null, 500, 0);
  createTestUser(tierDownline, tierUser, 20000, 0);
  tierResult = TierService.evaluateUserTier(tierUser);
  assertEqual(tierResult.tier, "V2", "Exact 500 personal + 20,000 team qualifies as V2");

  // Exact V3: 1,000 personal, 50,000 team
  createTestUser(tierUser, null, 1000, 0);
  createTestUser(tierDownline, tierUser, 50000, 0);
  tierResult = TierService.evaluateUserTier(tierUser);
  assertEqual(tierResult.tier, "V3", "Exact 1,000 personal + 50,000 team qualifies as V3");

  // Exact V4: 3,000 personal, 150,000 team
  createTestUser(tierUser, null, 3000, 0);
  createTestUser(tierDownline, tierUser, 150000, 0);
  tierResult = TierService.evaluateUserTier(tierUser);
  assertEqual(tierResult.tier, "V4", "Exact 3,000 personal + 150,000 team qualifies as V4");

  // Exact V5: 5,000 personal, 500,000 team
  createTestUser(tierUser, null, 5000, 0);
  createTestUser(tierDownline, tierUser, 500000, 0);
  tierResult = TierService.evaluateUserTier(tierUser);
  assertEqual(tierResult.tier, "V5", "Exact 5,000 personal + 500,000 team qualifies as V5");

  // Exact V6: 10,000 personal, 2,000,000 team
  createTestUser(tierUser, null, 10000, 0);
  createTestUser(tierDownline, tierUser, 2000000, 0);
  tierResult = TierService.evaluateUserTier(tierUser);
  assertEqual(tierResult.tier, "V6", "Exact 10,000 personal + 2,000,000 team qualifies as V6");

  // -------------------------------------------------------------------
  // TEST I: COMMUNITY TIER RATES
  // -------------------------------------------------------------------
  console.log("\n--- TEST I: COMMUNITY TIER RATES ---");
  assertEqual(TierService.getTierPercentage("V1"), 10, "V1 rate is 10%");
  assertEqual(TierService.getTierPercentage("V2"), 20, "V2 rate is 20%");
  assertEqual(TierService.getTierPercentage("V3"), 30, "V3 rate is 30%");
  assertEqual(TierService.getTierPercentage("V4"), 35, "V4 rate is 35%");
  assertEqual(TierService.getTierPercentage("V5"), 45, "V5 rate is 45%");
  assertEqual(TierService.getTierPercentage("V6"), 55, "V6 rate is 55%");

  // -------------------------------------------------------------------
  // TEST J: DIFFERENTIAL BONUS (Specification Example)
  // Sponsor V3 (30%), Downline V1 (10%), Volume 10,000 USDT
  // Expected Bonus = 10,000 * (30% - 10%) = 2,000 USDT
  // -------------------------------------------------------------------
  console.log("\n--- TEST J: DIFFERENTIAL BONUS ---");
  const sponsorV3 = "0x3030303030303030303030303030303030303030";
  const downlineV1 = "0x1010101010101010101010101010101010101010";
  const subDownline = "0x0101010101010101010101010101010101010101";

  createTestUser(sponsorV3, null, 1000, 0);
  createTestUser(downlineV1, sponsorV3, 100, 0);
  createTestUser(subDownline, downlineV1, 50000, 0); // Qualifies downline for V1, sponsor for V3

  // Verify tiers
  assertEqual(TierService.evaluateUserTier(sponsorV3).tier, "V3", "Sponsor is V3 (30%)");
  assertEqual(TierService.evaluateUserTier(downlineV1).tier, "V1", "Downline is V1 (10%)");

  const diffBonus = TierService.processDifferentialBonus(sponsorV3, downlineV1, 10000, `test_j_diff_${runId}`);
  assert(diffBonus !== null, "Differential bonus was created");
  if (diffBonus) {
    assertEqual(diffBonus.differentialRate, 20, "Rate difference: 30% - 10% = 20%");
    assertEqual(diffBonus.bonusAmount, 2000, "10,000 * 20% = 2,000 USDT bonus");
  }

  // -------------------------------------------------------------------
  // TEST K: NO NEGATIVE DIFFERENTIAL BONUS
  // Sponsor tier rate <= Downline tier rate -> Bonus must be 0 / null
  // -------------------------------------------------------------------
  console.log("\n--- TEST K: NO NEGATIVE DIFFERENTIAL BONUS ---");
  // Downline V3 vs Sponsor V1
  const diffNeg = TierService.processDifferentialBonus(downlineV1, sponsorV3, 10000, `test_k_diff_${runId}`);
  assertEqual(diffNeg, null, "Sponsor with lower tier rate than downline earns 0 differential bonus");

  // Equal tier (V1 vs V1)
  const peerUser = "0x1010101010101010101010101010101010101012";
  const peerSub = "0x1010101010101010101010101010101010101013";
  createTestUser(peerUser, null, 100, 0);
  createTestUser(peerSub, peerUser, 5000, 0); // Qualifies peerUser as V1 (10%)
  assertEqual(TierService.evaluateUserTier(peerUser).tier, "V1", "Peer user is V1 (10%)");

  const diffEqual = TierService.processDifferentialBonus(downlineV1, peerUser, 10000, `test_k_equal_${runId}`);
  assertEqual(diffEqual, null, "Sponsor with equal tier rate earns 0 differential bonus");

  // -------------------------------------------------------------------
  // TEST L: DUPLICATE REWARD PREVENTION (Idempotency)
  // -------------------------------------------------------------------
  console.log("\n--- TEST L: DUPLICATE REWARD PREVENTION ---");
  const eventKey = `test_l_unique_event_${runId}`;
  const initialComms = ReferralService.processReferralCommissions(testEarner, 100, "USDT", eventKey);
  const secondAttemptComms = ReferralService.processReferralCommissions(testEarner, 100, "USDT", eventKey);
  assertEqual(secondAttemptComms.length, 0, "Second attempt with identical event key is rejected (0 duplicate credits)");

  // -------------------------------------------------------------------
  // TEST M: CONCURRENT PROCESSING SIMULATION
  // -------------------------------------------------------------------
  console.log("\n--- TEST M: CONCURRENT PROCESSING ---");
  const concurrentEvent = `test_m_concurrent_event_${runId}`;
  const results = await Promise.all([
    Promise.resolve(ReferralService.processReferralCommissions(testEarner, 50, "USDT", concurrentEvent)),
    Promise.resolve(ReferralService.processReferralCommissions(testEarner, 50, "USDT", concurrentEvent)),
  ]);
  const totalCreated = results[0].length + results[1].length;
  assertEqual(totalCreated, 1, "Concurrent runs only generate 1 valid reward credit");

  // -------------------------------------------------------------------
  // TEST N: INVALID REFERRAL TREE
  // -------------------------------------------------------------------
  console.log("\n--- TEST N: INVALID REFERRAL TREE ---");
  // 1. Self-referral
  const selfUser = "0x5e1f5e1f5e1f5e1f5e1f5e1f5e1f5e1f5e1f5e1f";
  const selfCreated = db.getOrCreateUser(selfUser, selfUser);
  assertEqual(selfCreated.referrerAddress, null, "Self-referral rejected (referrer is null)");

  // 2. Circular referral: A -> B -> C -> A
  const circleA = "0xca00000000000000000000000000000000000001";
  const circleB = "0xcb00000000000000000000000000000000000002";
  const circleC = "0xcc00000000000000000000000000000000000003";

  createTestUser(circleA, null);
  createTestUser(circleB, circleA);
  createTestUser(circleC, circleB);

  // Now attempt to make A's referrer C (would create cycle: A -> B -> C -> A)
  assert(db.wouldCreateCycle(circleA, circleC), "wouldCreateCycle correctly detects A -> B -> C -> A cycle");
  const updateAttempt = db.getOrCreateUser(circleA, circleC);
  assert(updateAttempt.referrerAddress !== circleC.toLowerCase(), "Circular sponsor assignment rejected");

  // -------------------------------------------------------------------
  // TEST O: FINANCIAL PRECISION
  // -------------------------------------------------------------------
  console.log("\n--- TEST O: FINANCIAL PRECISION ---");
  const precisionVal1 = 0.1 + 0.2;
  const roundedPrecise = roundFinancial(precisionVal1, 6);
  assertEqual(roundedPrecise, 0.3, "Financial rounding correctly avoids 0.30000000000000004 float artifact");

  const fractionalReward = 33.333333;
  const commsFractional = roundFinancial(fractionalReward * 0.10, 6);
  assertEqual(commsFractional, 3.333333, "Fractional 10% commission rounds cleanly to 6 decimal places");

  // -------------------------------------------------------------------
  // TEST P: FRONTEND/BACKEND CONSISTENCY
  // -------------------------------------------------------------------
  console.log("\n--- TEST P: FRONTEND/BACKEND CONSISTENCY ---");
  const detailedReport = ReferralService.getDetailedReferralTree(a);
  assertEqual(detailedReport.summary.totalL1, 1, "Detailed report L1 count matches expected");
  assertEqual(detailedReport.summary.totalL2, 2, "Detailed report L2 count matches expected");
  assertEqual(detailedReport.summary.totalL3, 3, "Detailed report L3 count matches expected");
  assertEqual(detailedReport.l1Members.length, 1, "L1 member array length matches summary count");
  assertEqual(detailedReport.l2Members.length, 2, "L2 member array length matches summary count");
  assertEqual(detailedReport.l3Members.length, 3, "L3 member array length matches summary count");

  // -------------------------------------------------------------------
  // TEST Q: EXISTING FUNCTIONALITY PRESERVATION
  // -------------------------------------------------------------------
  console.log("\n--- TEST Q: EXISTING FUNCTIONALITY PRESERVATION ---");
  const plans = StakingService.getPlans();
  assert(plans.adsPlans.length === 5, "All 5 ADS staking plans preserved");
  assert(plans.usdtPlans.length === 3, "All 3 USDT staking plans preserved");

  const calcAds = StakingService.calculateReward("ADS", 1000, 360);
  assertEqual(calcAds.dailyRoiPercentage, 1.0, "ADS 360d daily ROI is 1.00%");
  assertEqual(calcAds.dailyRewardTokens, 20, "1,000 USDT deposit = 2,000 ADS -> 20 ADS daily reward");

  const calcUsdt = StakingService.calculateReward("USDT", 1000);
  assertEqual(calcUsdt.maxMultiplier, 2.5, "USDT 1,000 stake multiplier is 2.5X");
  assertEqual(calcUsdt.maxCapUsdt, 2500, "USDT 1,000 max cap is 2,500 USDT");

  console.log("\n=======================================================");
  console.log(`🏁 TEST SUITE FINISHED: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("=======================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
