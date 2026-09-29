import fs from "fs";
import path from "path";
import {
  User,
  AdsStakeRecord,
  UsdtStakeRecord,
  ReferralCommissionRecord,
  DifferentialBonusRecord,
  WithdrawalRecord,
} from "../types";

interface DatabaseSchema {
  users: Record<string, User>;
  adsStakes: AdsStakeRecord[];
  usdtStakes: UsdtStakeRecord[];
  referralCommissions: ReferralCommissionRecord[];
  differentialBonuses: DifferentialBonusRecord[];
  withdrawals: WithdrawalRecord[];
  stats: {
    totalAdsStaked: number;
    totalUsdtStaked: number;
    totalAdsBurned: number;
    treasuryBalanceUsdt: number;
    treasuryBalanceAds: number;
    lastCronRunAt: number;
  };
}

const DATA_DIR = path.resolve(__dirname, "../../data");
const DB_FILE = path.join(DATA_DIR, "store.json");

class DbService {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadData();
    this.sanitizeReferralGraph();
  }

  private loadData(): DatabaseSchema {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        return JSON.parse(raw);
      } catch (err) {
        console.error("Failed to parse db file, initializing fresh:", err);
      }
    }

    const initialData: DatabaseSchema = {
      users: {},
      adsStakes: [],
      usdtStakes: [],
      referralCommissions: [],
      differentialBonuses: [],
      withdrawals: [],
      stats: {
        totalAdsStaked: 0,
        totalUsdtStaked: 0,
        totalAdsBurned: 0,
        treasuryBalanceUsdt: 0,
        treasuryBalanceAds: 0,
        lastCronRunAt: 0,
      },
    };

    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }

  public save(): void {
    fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2));
  }

  /**
  /**
   * Sanitizes the referral graph to ensure:
   * 1. No user has themselves as referrer.
   * 2. No circular referral loops exist (e.g. A -> B -> C -> A).
   * 3. Breaks any detected cycles safely and logs the correction.
   */
  public sanitizeReferralGraph(): void {
    let modified = false;
    for (const [addr, user] of Object.entries(this.data.users)) {
      if (!user.referrerAddress) continue;
      const ref = user.referrerAddress.toLowerCase();

      // Check self-referral
      if (ref === addr.toLowerCase()) {
        console.warn(`[DB SANITIZE] Fixed self-referral on user ${addr}`);
        user.referrerAddress = null;
        modified = true;
        continue;
      }

      // Check circular referral
      const visited = new Set<string>([addr.toLowerCase()]);
      let curr: string | null = ref;
      let hasCycle = false;

      while (curr) {
        if (visited.has(curr)) {
          hasCycle = true;
          break;
        }
        visited.add(curr);
        const upline: User | undefined = this.data.users[curr];
        curr = upline && upline.referrerAddress ? upline.referrerAddress.toLowerCase() : null;
      }

      if (hasCycle) {
        console.warn(`[DB SANITIZE] Breaking circular referral relationship on user ${addr}`);
        user.referrerAddress = null;
        modified = true;
      }
    }

    if (modified) {
      this.save();
    }
  }

  /**
   * Checks whether setting potentialReferrer as referrer for userAddress would create a cycle.
   * Checks in BOTH directions:
   * 1. Walk UP from potentialReferrer to verify userAddress is not in potentialReferrer's upline.
   * 2. Walk DOWN from userAddress to verify potentialReferrer is not already in userAddress's downline tree.
   */
  public wouldCreateCycle(userAddress: string, potentialReferrer: string): boolean {
    const userNorm = userAddress.toLowerCase();
    const refNorm = potentialReferrer.toLowerCase();

    if (userNorm === refNorm) return true; // Self-referral

    // Direction 1: Walk UP from potentialReferrer
    let curr: string | null = refNorm;
    const visited = new Set<string>();

    while (curr) {
      if (curr === userNorm) return true; // Cycle back to user
      if (visited.has(curr)) return true; // Pre-existing loop in upline
      visited.add(curr);

      const upline: User | undefined = this.data.users[curr];
      curr = upline && upline.referrerAddress ? upline.referrerAddress.toLowerCase() : null;
    }

    // Direction 2: Walk DOWN from userNorm (BFS downline traversal)
    const queue = [userNorm];
    const downlineVisited = new Set<string>([userNorm]);

    while (queue.length > 0) {
      const parent = queue.shift()!;
      for (const u of Object.values(this.data.users)) {
        if (u.referrerAddress?.toLowerCase() === parent) {
          const childAddr = u.address.toLowerCase();
          if (childAddr === refNorm) {
            return true; // potentialReferrer is already a downline of userNorm!
          }
          if (!downlineVisited.has(childAddr)) {
            downlineVisited.add(childAddr);
            queue.push(childAddr);
          }
        }
      }
    }

    return false;
  }

  // --- Users ---
  public getOrCreateUser(address: string, referrerAddress?: string): User {
    const normalized = address.toLowerCase();
    let validatedRef: string | null = null;

    if (referrerAddress) {
      const refCandidate = referrerAddress.toLowerCase();
      if (refCandidate !== normalized && !this.wouldCreateCycle(normalized, refCandidate)) {
        validatedRef = refCandidate;
      }
    }

    if (!this.data.users[normalized]) {
      this.data.users[normalized] = {
        address: normalized,
        referrerAddress: validatedRef,
        referralCode: normalized,
        registeredAt: Date.now(),
        totalStakedAds: 0,
        totalStakedUsdt: 0,
        pendingAdsRewards: 0,
        pendingUsdtRewards: 0,
        totalAdsEarned: 0,
        totalUsdtEarned: 0,
        isParticipant: false,
        participantSince: null,
        communityTier: "V0",
      };
      this.save();
    } else if (validatedRef && !this.data.users[normalized].referrerAddress) {
      // User exists without a referrer, and a valid non-circular referrer was provided
      if (!this.wouldCreateCycle(normalized, validatedRef)) {
        this.data.users[normalized].referrerAddress = validatedRef;
        this.save();
        this.sanitizeReferralGraph();
      }
    }

    return this.data.users[normalized];
  }

  public getUser(address: string): User | undefined {
    return this.data.users[address.toLowerCase()];
  }

  public getAllUsers(): User[] {
    return Object.values(this.data.users);
  }

  public updateUser(user: User): void {
    this.data.users[user.address.toLowerCase()] = user;
    this.save();
  }

  // --- ADS Stakes ---
  public addAdsStake(stake: AdsStakeRecord): void {
    this.data.adsStakes.push(stake);
    this.data.stats.totalAdsStaked += stake.amount;
    this.save();
  }

  public getAdsStakes(userAddress?: string): AdsStakeRecord[] {
    if (!userAddress) return this.data.adsStakes;
    const normalized = userAddress.toLowerCase();
    return this.data.adsStakes.filter((s) => s.userAddress.toLowerCase() === normalized);
  }

  public updateAdsStake(stake: AdsStakeRecord): void {
    const idx = this.data.adsStakes.findIndex((s) => s.id === stake.id);
    if (idx !== -1) {
      this.data.adsStakes[idx] = stake;
      this.save();
    }
  }

  // --- USDT Stakes ---
  public addUsdtStake(stake: UsdtStakeRecord): void {
    this.data.usdtStakes.push(stake);
    this.data.stats.totalUsdtStaked += stake.amountUsdt;
    // 80% to buy & burn, 20% to liquidity support
    const buyBurn = stake.amountUsdt * 0.8;
    this.data.stats.totalAdsBurned += buyBurn; // represented in USDT value of burned ADS
    this.save();
  }

  public getUsdtStakes(userAddress?: string): UsdtStakeRecord[] {
    if (!userAddress) return this.data.usdtStakes;
    const normalized = userAddress.toLowerCase();
    return this.data.usdtStakes.filter((s) => s.userAddress.toLowerCase() === normalized);
  }

  public updateUsdtStake(stake: UsdtStakeRecord): void {
    const idx = this.data.usdtStakes.findIndex((s) => s.id === stake.id);
    if (idx !== -1) {
      this.data.usdtStakes[idx] = stake;
      this.save();
    }
  }

  // --- Referral Commissions (Idempotent) ---
  public hasReferralCommission(id: string): boolean {
    return this.data.referralCommissions.some((c) => c.id === id);
  }

  public addReferralCommission(rec: ReferralCommissionRecord): boolean {
    if (this.hasReferralCommission(rec.id)) {
      return false; // Prevent double payment
    }
    this.data.referralCommissions.push(rec);
    this.save();
    return true;
  }

  public getReferralCommissions(userAddress?: string): ReferralCommissionRecord[] {
    if (!userAddress) return this.data.referralCommissions;
    const normalized = userAddress.toLowerCase();
    return this.data.referralCommissions.filter(
      (c) => c.recipientAddress.toLowerCase() === normalized
    );
  }

  // --- Differential Bonuses (Idempotent) ---
  public hasDifferentialBonus(id: string): boolean {
    return this.data.differentialBonuses.some((b) => b.id === id);
  }

  public addDifferentialBonus(rec: DifferentialBonusRecord): boolean {
    if (this.hasDifferentialBonus(rec.id)) {
      return false; // Prevent double payment
    }
    this.data.differentialBonuses.push(rec);
    this.save();
    return true;
  }

  public getDifferentialBonuses(userAddress?: string): DifferentialBonusRecord[] {
    if (!userAddress) return this.data.differentialBonuses;
    const normalized = userAddress.toLowerCase();
    return this.data.differentialBonuses.filter(
      (b) => b.recipientAddress.toLowerCase() === normalized
    );
  }

  // --- Withdrawals ---
  public addWithdrawal(rec: WithdrawalRecord): void {
    this.data.withdrawals.push(rec);
    if (rec.token === "ADS") {
      this.data.stats.treasuryBalanceAds += rec.taxAmount;
    } else {
      this.data.stats.treasuryBalanceUsdt += rec.taxAmount;
    }
    this.save();
  }

  public getWithdrawals(userAddress?: string): WithdrawalRecord[] {
    if (!userAddress) return this.data.withdrawals;
    const normalized = userAddress.toLowerCase();
    return this.data.withdrawals.filter((w) => w.userAddress.toLowerCase() === normalized);
  }

  // --- Stats ---
  public getStats() {
    return this.data.stats;
  }

  public setLastCronRunAt(time: number): void {
    this.data.stats.lastCronRunAt = time;
    this.save();
  }

  public clearUserData(userAddress: string): void {
    const normalized = userAddress.toLowerCase();
    const downlines = new Set<string>();
    for (const u of Object.values(this.data.users)) {
      if (u.referrerAddress?.toLowerCase() === normalized) {
        downlines.add(u.address.toLowerCase());
      }
    }
    for (const u of Object.values(this.data.users)) {
      if (u.referrerAddress && downlines.has(u.referrerAddress.toLowerCase())) {
        downlines.add(u.address.toLowerCase());
      }
    }
    for (const addr of downlines) {
      delete this.data.users[addr];
    }
    this.data.adsStakes = this.data.adsStakes.filter(
      (s) => s.userAddress.toLowerCase() !== normalized && !downlines.has(s.userAddress.toLowerCase())
    );
    this.data.usdtStakes = this.data.usdtStakes.filter(
      (s) => s.userAddress.toLowerCase() !== normalized && !downlines.has(s.userAddress.toLowerCase())
    );
    this.data.referralCommissions = this.data.referralCommissions.filter(
      (c) => c.recipientAddress.toLowerCase() !== normalized
    );
    this.data.differentialBonuses = this.data.differentialBonuses.filter(
      (b) => b.recipientAddress.toLowerCase() !== normalized
    );
    if (this.data.users[normalized]) {
      this.data.users[normalized].totalStakedAds = 0;
      this.data.users[normalized].totalStakedUsdt = 0;
      this.data.users[normalized].pendingAdsRewards = 0;
      this.data.users[normalized].pendingUsdtRewards = 0;
      this.data.users[normalized].totalAdsEarned = 0;
      this.data.users[normalized].totalUsdtEarned = 0;
      this.data.users[normalized].communityTier = "V0";
    }
    this.save();
  }
}

export const db = new DbService();
