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
  /**
   * Processed idempotency keys — prevents duplicate reward credits.
   * Key = idempotency key string, value = record ID that was created.
   */
  processedKeys: Record<string, string>;
}

const DATA_DIR = path.resolve(__dirname, "../../data");
const DB_FILE = path.join(DATA_DIR, "store.json");

class DbService {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadData();
  }

  private loadData(): DatabaseSchema {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const parsed = JSON.parse(raw) as DatabaseSchema;
        // Migrate: ensure processedKeys exists for older data files
        if (!parsed.processedKeys) {
          parsed.processedKeys = {};
        }
        return parsed;
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
      processedKeys: {},
    };

    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }

  private save(): void {
    fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2));
  }

  // --- Users ---
  public getOrCreateUser(address: string, referrerAddress?: string): User {
    const normalized = address.toLowerCase();
    if (!this.data.users[normalized]) {
      let ref = referrerAddress ? referrerAddress.toLowerCase() : null;
      // Prevent self-referral
      if (ref === normalized) ref = null;
      // Prevent circular referral: check if normalized is an ancestor of ref
      if (ref && this.wouldCreateCircle(normalized, ref)) {
        console.warn(`[DB] Rejected circular referral: ${normalized} -> ${ref}`);
        ref = null;
      }

      this.data.users[normalized] = {
        address: normalized,
        referrerAddress: ref,
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
    } else if (referrerAddress) {
      let ref = referrerAddress.toLowerCase();
      const existing = this.data.users[normalized];
      if (
        ref !== normalized &&
        !existing.referrerAddress &&
        !this.wouldCreateCircle(normalized, ref)
      ) {
        existing.referrerAddress = ref;
        this.save();
      }
    }
    return this.data.users[normalized];
  }

  /**
   * Returns true if setting `newUserAddress.referrerAddress = proposedRefAddress`
   * would create a circular chain (A -> B -> ... -> A).
   */
  private wouldCreateCircle(newUserAddress: string, proposedRefAddress: string): boolean {
    const visited = new Set<string>();
    let current: string | null | undefined = proposedRefAddress;
    while (current) {
      if (current === newUserAddress) return true;
      if (visited.has(current)) return false; // detached loop not involving newUser
      visited.add(current);
      current = this.data.users[current]?.referrerAddress;
    }
    return false;
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

  // --- Referral Commissions ---
  /**
   * Adds a referral commission record only if the idempotency key has not been processed.
   * Returns true if the record was added, false if it was a duplicate.
   */
  public addReferralCommission(rec: ReferralCommissionRecord, idempotencyKey: string): boolean {
    if (this.data.processedKeys[idempotencyKey]) {
      console.warn(`[DB] Duplicate referral commission rejected. Key: ${idempotencyKey}`);
      return false;
    }
    this.data.referralCommissions.push(rec);
    this.data.processedKeys[idempotencyKey] = rec.id;
    this.save();
    return true;
  }

  public getReferralCommissions(userAddress: string): ReferralCommissionRecord[] {
    const normalized = userAddress.toLowerCase();
    return this.data.referralCommissions.filter(
      (c) => c.recipientAddress.toLowerCase() === normalized
    );
  }

  // --- Differential Bonuses ---
  /**
   * Adds a differential bonus record only if the idempotency key has not been processed.
   * Returns true if the record was added, false if it was a duplicate.
   */
  public addDifferentialBonus(rec: DifferentialBonusRecord, idempotencyKey: string): boolean {
    if (this.data.processedKeys[idempotencyKey]) {
      console.warn(`[DB] Duplicate differential bonus rejected. Key: ${idempotencyKey}`);
      return false;
    }
    this.data.differentialBonuses.push(rec);
    this.data.processedKeys[idempotencyKey] = rec.id;
    this.save();
    return true;
  }

  public getDifferentialBonuses(userAddress: string): DifferentialBonusRecord[] {
    const normalized = userAddress.toLowerCase();
    return this.data.differentialBonuses.filter(
      (b) => b.recipientAddress.toLowerCase() === normalized
    );
  }

  // --- Idempotency check ---
  public isKeyProcessed(key: string): boolean {
    return !!this.data.processedKeys[key];
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
