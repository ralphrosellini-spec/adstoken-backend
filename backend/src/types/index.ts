export interface User {
  address: string;
  referrerAddress: string | null;
  referralCode?: string;
  registeredAt: number;
  totalStakedAds: number;
  totalStakedUsdt: number;
  pendingAdsRewards: number;
  pendingUsdtRewards: number;
  totalAdsEarned: number;
  totalUsdtEarned: number;
  isParticipant: boolean;
  participantSince: number | null;
  communityTier: "V0" | "V1" | "V2" | "V3" | "V4" | "V5" | "V6";
}

export interface AdsStakeRecord {
  id: string;
  userAddress: string;
  amount: number; // ADS principal tracked
  usdtDeposited?: number; // USDT deposited by user
  adsEntryPrice?: number; // Price at stake time ($0.50)
  periodDays: number; // 0 = flexible, 30, 90, 180, 360
  dailyRoiBps: number; // 20, 40, 60, 80, 100
  startTime: number;
  maturityTime: number;
  claimedRewards: number;
  lastRoiCreditTime: number;
  isMatured: boolean;
  status: "ACTIVE" | "COMPLETED" | "WITHDRAWN";
  txHash?: string;
}

export interface UsdtStakeRecord {
  id: string;
  userAddress: string;
  amountUsdt: number;
  adsEntryPrice?: number;
  dailyRoiRate: number; // 0.01 (1% daily)
  maxMultiplier: number; // 2.0, 2.5, or 3.0
  maxCapUsdt: number;
  claimedRewardsUsdt: number;
  claimedRewardsAds?: number;
  startTime: number;
  lastRoiCreditTime: number;
  status: "ACTIVE" | "COMPLETED";
  txHash?: string;
}

export interface ReferralCommissionRecord {
  id: string; // Idempotency key
  recipientAddress: string;
  fromUserAddress: string;
  level: 1 | 2 | 3;
  commissionPercentage: number; // 10%, 3%, 2%
  baseRewardAmount: number;
  commissionAmount: number;
  token: "ADS" | "USDT";
  timestamp: number;
  eventId?: string;
  status?: "COMPLETED" | "PENDING";
}

export interface DifferentialBonusRecord {
  id: string; // Idempotency key
  recipientAddress: string;
  downlineAddress: string;
  recipientTier: string;
  downlineTier: string;
  differentialRate: number;
  eligibleVolume: number;
  bonusAmount: number;
  timestamp: number;
  eventId?: string;
  token?: "ADS" | "USDT";
}

export interface WithdrawalRecord {
  id: string;
  userAddress: string;
  token: "ADS" | "USDT";
  grossAmount: number;
  taxAmount: number; // 3%
  netAmount: number; // 97%
  payoutToken?: "ADS" | "USDT";
  status: "PENDING" | "PROCESSED" | "FAILED";
  timestamp: number;
  txHash?: string;
}
