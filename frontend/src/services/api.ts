// ADSToken v2.0 DApp â€” Backend API Service
// All data is authoritative from the backend. Zero hardcoded values on frontend.

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/staking';

// â”€â”€â”€ Response Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface CalculationResult {
  token: 'ADS' | 'USDT';
  stakedAmount: number;
  usdtDeposited?: number;
  adsPrice?: number;
  periodDays?: number;
  dailyRoiBps?: number;
  dailyRoiPercentage: number;
  dailyRewardTokens?: number;
  dailyRewardUsdt: number;
  dailyRewardAds?: number;
  rewardPerMinuteTestnet: number;
  rewardPerSecond: number;
  totalPeriodRewardTokens?: number | null;
  totalPeriodRewardUsdt?: number | null;
  capitalReturnedAtMaturity?: boolean;
  maxMultiplier?: number;
  capTier?: string;
  maxCapUsdt?: number;
  maxCapAds?: number;
  daysToCap?: number;
  buyBurnAllocationUsdt?: number;
  liquidityAllocationUsdt?: number;
  payoutCurrency?: string;
}

export interface BackendUserDashboard {
  user: {
    address: string;
    referrerAddress: string | null;
    totalStakedAds: number;
    totalStakedUsdt: number;
    pendingAdsRewards: number;
    pendingUsdtRewards: number;
    totalAdsEarned: number;
    totalUsdtEarned: number;
    isParticipant: boolean;
    communityTier: string;
    dailySellLimitPercentage: number;
  };
  adsStakes: AdsStake[];
  usdtStakes: UsdtStake[];
  withdrawals: Withdrawal[];
  activePlansCount: number;
  referralCommissionsCount: number;
  differentialBonusesCount: number;
}

export interface AdsStake {
  id: string;
  userAddress: string;
  amount: number;
  periodDays: number;
  dailyRoiBps: number;
  startTime: number;
  maturityTime: number;
  claimedRewards: number;
  lastRoiCreditTime: number;
  isMatured: boolean;
  status: 'ACTIVE' | 'COMPLETED' | 'WITHDRAWN';
  txHash?: string;
}

export interface UsdtStake {
  id: string;
  userAddress: string;
  amountUsdt: number;
  dailyRoiRate: number;
  maxMultiplier: number;
  maxCapUsdt: number;
  claimedRewardsUsdt: number;
  startTime: number;
  lastRoiCreditTime: number;
  status: 'ACTIVE' | 'COMPLETED';
  txHash?: string;
}

export interface Withdrawal {
  id: string;
  userAddress: string;
  token: 'ADS' | 'USDT';
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
  status: string;
  timestamp: number;
  txHash?: string;
}

export interface DownlineMember {
  walletAddress: string;
  sponsorAddress?: string;
  stakeAmountAds: number;
  stakeAmountUsdt: number;
  totalStakeUsd: number;
  date: string;
  txnHash: string;
  dailyRewardGenerated: number;
  commissionEarned: number;
  isActive?: boolean;
}

export interface TierIncomeRecord {
  id: string;
  fromUserAddress: string;
  downlineTier: string;
  userTier: string;
  differentialRate: number;
  eligibleVolume: number;
  bonusAmount: number;
  token: 'ADS' | 'USDT';
  timestamp: number;
  txHash: string;
}

export interface ReferralReport {
  summary: {
    totalL1: number;
    totalL2: number;
    totalL3: number;
    activeL1?: number;
    activeL2?: number;
    activeL3?: number;
    directVolume?: number;
    teamVolume?: number;
    totalL1Earned: number;
    totalL2Earned: number;
    totalL3Earned: number;
    totalReferralEarned: number;
    eligibility?: {
      l1: boolean;
      l2: boolean;
      l3: boolean;
    };
  };
  l1Members: DownlineMember[];
  l2Members: DownlineMember[];
  l3Members: DownlineMember[];
  tierIncome: {
    totalTierEarned: number;
    tierBreakdown: { tier: string; totalEarned: number; count: number }[];
    history: TierIncomeRecord[];
  };
}

export interface TierInfo {
  currentTier: string;
  bonusPercentage: number;
  personalStaking?: number;
  teamVolume?: number;
  weakLegVolume: number;
  strongLegVolume: number;
  totalVolume: number;
  nextTier?: string | null;
  nextTierRate?: number | null;
  personalRequired?: number;
  teamVolumeRequired?: number;
  personalProgress?: number;
  teamProgress?: number;
  tierRequirements: Array<{
    tier: string;
    minPersonalStakingUsdt?: number;
    minPersonalStaking?: number;
    minTeamVolumeUsdt?: number;
    minWeakLegVolume?: number;
    bonusPercentage: number;
  }>;
  differentialBonuses: TierIncomeRecord[];
  tierBreakdown: { tier: string; totalEarned: number; count: number }[];
  totalTierEarned: number;
}

// â”€â”€â”€ API Client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API request failed');
  return json.data as T;
}

export const api = {
  // Plans metadata
  async getPlans() {
    return request<any>(`${API_BASE}/plans`);
  },

  // Server-side reward calculation (authoritative)
  async calculate(token: 'ADS' | 'USDT', amount: number, periodDays = 0): Promise<CalculationResult> {
    return request<CalculationResult>(`${API_BASE}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, amount, periodDays }),
    });
  },

  // Register / connect user with sponsor referrer
  async connectUser(address: string, referrer?: string) {
    const res = await fetch(`${API_BASE}/user/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, referrer }),
    });
    return res.json();
  },

  // User dashboard â€” server-calculated live pending rewards
  async getUserDashboard(address: string): Promise<BackendUserDashboard> {
    return request<BackendUserDashboard>(`${API_BASE}/user/${address}/dashboard`);
  },

  // Record ADS stake after on-chain tx confirmation
  async recordAdsStake(params: {
    address: string;
    amount: number;
    periodDays: number;
    referrer?: string;
    txHash?: string;
  }) {
    const res = await fetch(`${API_BASE}/stake-ads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  // Record USDT stake after on-chain tx confirmation
  async recordUsdtStake(params: {
    address: string;
    amountUsdt: number;
    referrer?: string;
    txHash?: string;
  }) {
    const res = await fetch(`${API_BASE}/stake-usdt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  // Record withdrawal after on-chain tx
  async recordWithdrawal(params: { address: string; token: 'ADS' | 'USDT'; amount: number }) {
    const res = await fetch(`${API_BASE}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  // Full 3-level referral tree + tier income
  async getReferrals(address: string): Promise<ReferralReport> {
    return request<{ detailedReport: ReferralReport }>(`${API_BASE}/referrals/${address}`)
      .then((d) => d.detailedReport);
  },

  // Community tier info + leg volumes + differential bonus history
  async getTierInfo(address: string): Promise<TierInfo> {
    return request<TierInfo>(`${API_BASE}/tiers/${address}`);
  },

  // Ecosystem stats
  async getEcosystemStats() {
    return request<any>(`${API_BASE}/stats/ecosystem`);
  },

  // Simulate test downline on backend (authoritative DB)
  async addTestDownline(params: {
    sponsorAddress: string;
    level: 1 | 2 | 3;
    amount: number;
    token?: 'ADS' | 'USDT';
  }): Promise<ReferralReport> {
    return request<ReferralReport>(`${API_BASE}/admin/add-test-downline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  },

  // Reset user data on backend (authoritative DB)
  async resetUserData(address: string) {
    const res = await fetch(`${API_BASE}/admin/reset-user-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    return res.json();
  },
};
