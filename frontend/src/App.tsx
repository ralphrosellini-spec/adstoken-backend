import React, { useState, useEffect, useMemo } from 'react';
import {
  Coins,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  Flame,
  Percent,
  Award,
  ExternalLink,
  Copy,
  CheckCircle,
  AlertCircle,
  BarChart3,
  PlusCircle,
  ArrowRight,
  ArrowDown,
  Layers,
  ChevronRight,
  RefreshCw,
  Droplets,
  Zap,
  Sparkles,
  Check,
  Settings,
  Unlock,
  LogOut,
  Search,
  DollarSign,
  Calendar,
  Hash,
  X,
  Shield,
  Network,
  Gift,
  FileText,
  Lock,
  History
} from 'lucide-react';
import { BrowserProvider, Contract, formatEther, parseEther } from 'ethers';
import deployedAddresses from './contracts/deployedAddresses.json';
import { ERC20_ABI, MOCK_USDT_ABI, VAULT_ABI, SWAP_ABI } from './contracts/abis';
import { api, CalculationResult } from './services/api';

// Structure for Referral Member Report
interface DownlineMember {
  id: string;
  walletAddress: string;
  level: 1 | 2 | 3;
  stakeAmount: number; // in USDT value
  stakeToken: 'USDT' | 'ADS';
  stakeAmountRaw: number;
  date: string;
  txnHash: string;
  dailyRewardGenerated: number;
  commissionEarned: number;
  isActive: boolean;
}

// Structure for Community Tier Income Record
interface TierIncomeRecord {
  id: string;
  downlineAddress: string;
  downlineTier: 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6';
  userTier: 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6';
  differentialRate: number; // e.g. 20%
  eligibleVolume: number; // in ADS or USDT
  incomeReceived: number;
  token: 'ADS' | 'USDT';
  date: string;
  txnHash: string;
}

// Structure for Active Staking Position
interface ActivePlanItem {
  id: string | number;
  stakeId: number;
  type: 'ADS' | 'USDT';
  usdtAmount: number;
  adsAmount: number;
  periodDays: number;
  periodLabel: string;
  dailyRoiText: string;
  maxCapping: string;
  stakeDate: string;
  earningTillDate: string;
  endDate: string;
  isFlexible: boolean;
  isMatured: boolean;
  isWithdrawn: boolean;
  startTime?: number;
  status?: 'ACTIVE' | 'UNSTAKED' | 'PERIOD_OVER' | 'COMPLETED';
  statusText?: string;
  completedDate?: string;
}

export default function App() {
  // Navigation: 'dashboard' | 'stake' | 'withdrawal' | 'referrals' | 'tools' | 'swap'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stake' | 'withdrawal' | 'referrals' | 'tools' | 'swap'>('dashboard');

  // Sub-modes
  const [dashboardMode, setDashboardMode] = useState<'ads' | 'usdt'>('ads');
  const [stakeMode, setStakeMode] = useState<'ads' | 'usdt'>('ads');

  // Referrals Sub-tab: 'tree' | 'report' | 'tierIncome'
  const [referralsSubTab, setReferralsSubTab] = useState<'tree' | 'report' | 'tierIncome'>('tree');
  const [selectedReportLevel, setSelectedReportLevel] = useState<1 | 2 | 3>(1);
  const [reportSearchQuery, setReportSearchQuery] = useState<string>('');

  // Wallet
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [, setIsTestnet] = useState<boolean>(false);
  const [showWalletModal, setShowWalletModal] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string; txHash?: string } | null>(null);

  // Referral Handling from URL (MetaMask dApp Browser Compatible)
  const [sponsorReferrer, setSponsorReferrer] = useState<string>('');

  // Balances
  const [walletAdsBalance, setWalletAdsBalance] = useState<string>('0.00');
  const [walletUsdtBalance, setWalletUsdtBalance] = useState<string>('0.00');
  const [onChainStakedAds, setOnChainStakedAds] = useState<string>('0.00');
  const [onChainStakedUsdt, setOnChainStakedUsdt] = useState<string>('0.00');
  const [pendingAdsRewards, setPendingAdsRewards] = useState<string>('0.0000');
  const [pendingUsdtRewards, setPendingUsdtRewards] = useState<string>('0.0000');
  const [activePlansCount, setActivePlansCount] = useState<number>(0);
  const [userActivePlans, setUserActivePlans] = useState<ActivePlanItem[]>([]);
  const [userActiveAdsPlans, setUserActiveAdsPlans] = useState<ActivePlanItem[]>([]);
  const [userActiveUsdtPlans, setUserActiveUsdtPlans] = useState<ActivePlanItem[]>([]);
  const [userHistoryAdsPlans, setUserHistoryAdsPlans] = useState<ActivePlanItem[]>([]);
  const [userHistoryUsdtPlans, setUserHistoryUsdtPlans] = useState<ActivePlanItem[]>([]);
  const [stakingViewTab, setStakingViewTab] = useState<'active' | 'history'>('active');

  // ADS Staking Flow State (Module 1)
  const [stakeUsdtInput, setStakeUsdtInput] = useState<string>('1000');
  const [selectedAdsPeriod, setSelectedAdsPeriod] = useState<number>(360);

  // USDT Staking Flow State (Module 2)
  const [usdtDepositInput, setUsdtDepositInput] = useState<string>('1000');

  // Withdrawal Flow State (Steps 10, 11, 12, 13)
  const [withdrawToken, setWithdrawToken] = useState<'ADS' | 'USDT'>('ADS');

  // Processing state & step descriptions
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStep, setProcessingStep] = useState<string>('');

  // Server-Calculated Staking Previews (from Backend API)
  const [serverCalculationAds, setServerCalculationAds] = useState<CalculationResult | null>(null);
  const [serverCalculationUsdt, setServerCalculationUsdt] = useState<CalculationResult | null>(null);

  // Downline Members State (Persistent in localStorage)
  const [downlineMembers, setDownlineMembers] = useState<DownlineMember[]>([]);
  const [tierIncomeRecords, setTierIncomeRecords] = useState<TierIncomeRecord[]>([]);

  // User Community Tier & Team Stats (Authoritative from Backend API)
  const [userCommunityTier, setUserCommunityTier] = useState<string>('V0');
  const [userTierBonusPercentage, setUserTierBonusPercentage] = useState<number>(0);
  const [personalStakingAmount, setPersonalStakingAmount] = useState<number>(0);
  const [totalTeamStakingVolume, setTotalTeamStakingVolume] = useState<number>(0);
  const [weakLegVolume, setWeakLegVolume] = useState<number>(0);
  const [strongLegVolume, setStrongLegVolume] = useState<number>(0);
  const [nextTierName, setNextTierName] = useState<string | null>(null);
  const [nextTierRate, setNextTierRate] = useState<number | null>(null);
  const [nextPersonalRequired, setNextPersonalRequired] = useState<number>(0);
  const [nextTeamVolumeRequired, setNextTeamVolumeRequired] = useState<number>(0);
  const [personalProgressPct, setPersonalProgressPct] = useState<number>(0);
  const [teamProgressPct, setTeamProgressPct] = useState<number>(0);
  const [tierBreakdownList, setTierBreakdownList] = useState<{ tier: string; totalEarned: number; count: number }[]>([]);
  const [totalTierEarnedAmount, setTotalTierEarnedAmount] = useState<number>(0);

  // Active Referral & Eligibility State
  const [activeL1Count, setActiveL1Count] = useState<number>(0);
  const [activeL2Count, setActiveL2Count] = useState<number>(0);
  const [activeL3Count, setActiveL3Count] = useState<number>(0);
  const [directVolumeAmount, setDirectVolumeAmount] = useState<number>(0);
  const [referralEligibility, setReferralEligibility] = useState<{ l1: boolean; l2: boolean; l3: boolean }>({
    l1: false,
    l2: false,
    l3: false,
  });

  // =========================================================================
  // SWAP STATE (ADS <-> USDT)
  // =========================================================================
  const [swapDirection, setSwapDirection] = useState<'USDT_TO_ADS' | 'ADS_TO_USDT'>('ADS_TO_USDT');
  const [swapInputAmount, setSwapInputAmount] = useState<string>('');
  const [swapEstimatedOutput, setSwapEstimatedOutput] = useState<string>('');
  const [swapTaxAmount, setSwapTaxAmount] = useState<string>('');
  const [swapRate, setSwapRate] = useState<string>('2 ADS = 1 USDT');
  const [swapSlippage, setSwapSlippage] = useState<number>(0.5);
  const [swapMaxLimit, setSwapMaxLimit] = useState<string>('');
  const [isSwapPaused, setIsSwapPaused] = useState<boolean>(false);
  const [swapContractLiquidity, setSwapContractLiquidity] = useState<{ ads: string; usdt: string }>({ ads: '0', usdt: '0' });

  const notify = (type: 'success' | 'error' | 'info', message: string, txHash?: string) => {
    setNotification({ type, message, txHash });
    setTimeout(() => setNotification(null), 8000);
  };

  const copyToClipboard = (text: string, id?: string) => {
    navigator.clipboard.writeText(text);
    if (id) {
      setCopiedAddress(id);
      setTimeout(() => setCopiedAddress(null), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // =========================================================================
  // 1. EXTRACT REFERRAL PARAM FROM URL (MetaMask dApp Browser compatible)
  // =========================================================================
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let ref = urlParams.get('ref') || urlParams.get('referrer');

      if (!ref && window.location.hash.includes('ref=')) {
        const hashQuery = window.location.hash.split('ref=')[1];
        ref = hashQuery ? hashQuery.split('&')[0] : null;
      }

      if (ref) {
        ref = ref.trim();
        localStorage.setItem('adstoken_referrer', ref);
        setSponsorReferrer(ref);
      } else {
        const cachedRef = localStorage.getItem('adstoken_referrer');
        if (cachedRef) {
          setSponsorReferrer(cachedRef);
        }
      }
    } catch (e) {
      console.error('Error parsing referral param:', e);
    }
  }, []);

  // =========================================================================
  // 2. FETCH INITIAL AUTHORITATIVE STATE FROM BACKEND ON MOUNT
  // =========================================================================
  useEffect(() => {
    if (walletAddress) {
      loadBlockchainData(walletAddress);
    }
  }, [walletAddress]);

  // Dynamic Calculation from Backend API (Module 1: ADS Staking)
  useEffect(() => {
    const amt = parseFloat(stakeUsdtInput) || 0;
    if (amt > 0) {
      api.calculate('ADS', amt, selectedAdsPeriod)
        .then(setServerCalculationAds)
        .catch((err) => console.warn('Backend ADS calculation note:', err.message));
    }
  }, [stakeUsdtInput, selectedAdsPeriod]);

  // Dynamic Calculation from Backend API (Module 2: USDT Staking)
  useEffect(() => {
    const amt = parseFloat(usdtDepositInput) || 0;
    if (amt > 0) {
      api.calculate('USDT', amt)
        .then(setServerCalculationUsdt)
        .catch((err) => console.warn('Backend USDT calculation note:', err.message));
    }
  }, [usdtDepositInput]);

  // Load swap liquidity whenever the Swap tab is opened
  useEffect(() => {
    if (activeTab === 'swap') {
      loadSwapLiquidity();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // =========================================================================
  // 3. PERIODIC BACKEND & BLOCKCHAIN DATA POLLING
  // =========================================================================
  useEffect(() => {
    if (!walletAddress) return;
    const interval = setInterval(() => {
      loadBlockchainData(walletAddress);
    }, 15000);

    return () => clearInterval(interval);
  }, [walletAddress]);

  // Load Authoritative State from Backend API + Connected BSC Blockchain
  const loadBlockchainData = async (addr: string) => {
    if (!addr) return;
    // Guard: clear self-referral from localStorage if user's own address was cached
    const cachedRef = localStorage.getItem('adstoken_referrer');
    if (cachedRef && cachedRef.toLowerCase() === addr.toLowerCase()) {
      localStorage.removeItem('adstoken_referrer');
      setSponsorReferrer('');
    }

    // Offline / Instant Persistence: Load previously cached downlines so data never resets to 0 when laptop sleeps
    try {
      const cachedDownlines = localStorage.getItem(`adstoken_downlines_v2_${addr.toLowerCase()}`);
      if (cachedDownlines) {
        const parsed = JSON.parse(cachedDownlines);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDownlineMembers(parsed);
        }
      }
      const cachedSummary = localStorage.getItem(`adstoken_ref_summary_v2_${addr.toLowerCase()}`);
      if (cachedSummary) {
        const s = JSON.parse(cachedSummary);
        if (s.activeL1 !== undefined) setActiveL1Count(s.activeL1);
        if (s.activeL2 !== undefined) setActiveL2Count(s.activeL2);
        if (s.activeL3 !== undefined) setActiveL3Count(s.activeL3);
        if (s.directVolume !== undefined) setDirectVolumeAmount(s.directVolume);
        if (s.teamVolume !== undefined) setTotalTeamStakingVolume(s.teamVolume);
        if (s.eligibility) setReferralEligibility(s.eligibility);
      }
    } catch (e) {
      console.warn('Error reading cached downlines:', e);
    }

    try {
      // 1. Fetch Backend Calculated State (Authoritative Server Engine)
      try {
        const effectiveReferrer = sponsorReferrer.toLowerCase() !== addr.toLowerCase() ? sponsorReferrer : '';
        await api.connectUser(addr, effectiveReferrer);
        const [dashboard, referrals, tierData] = await Promise.all([
          api.getUserDashboard(addr).catch(() => null),
          api.getReferrals(addr).catch(() => null),
          api.getTierInfo(addr).catch(() => null),
        ]);

        if (dashboard && dashboard.user) {
          // NOTE: totalStakedAds & totalStakedUsdt from backend may be stale.
          // On-chain Web3 data (loaded below) is authoritative and will overwrite.
          // Only use backend for fields not available on-chain: pendingRewards, tier, referrer.
          setPendingAdsRewards(dashboard.user.pendingAdsRewards.toFixed(4));
          setPendingUsdtRewards(dashboard.user.pendingUsdtRewards.toFixed(4));
          if (dashboard.user.communityTier) {
            setUserCommunityTier(dashboard.user.communityTier);
          }
          if (dashboard.user.referrerAddress) {
            setSponsorReferrer(dashboard.user.referrerAddress);
          }
        }


        if (referrals) {
          const userNorm = addr.toLowerCase();
          const uplineNorm = (dashboard?.user?.referrerAddress || sponsorReferrer || '').toLowerCase();

          // Strict filter: Exclude the user themselves AND the user's sponsor/referrer ID
          // No referrer ID or user self-address can EVER appear in L1, L2, L3 downlines!
          const isDownlineValid = (m: any) => {
            const mAddr = (m.walletAddress || '').toLowerCase();
            return mAddr && mAddr !== userNorm && mAddr !== uplineNorm;
          };

          const allMembers: DownlineMember[] = [
            ...(referrals.l1Members || []).filter(isDownlineValid).map((m: any, idx: number) => ({
              id: `l1_${idx}`,
              walletAddress: m.walletAddress,
              level: 1 as const,
              stakeAmount: m.totalStakeUsd || m.stakeAmountUsdt || 0,
              stakeToken: (m.stakeAmountAds > 0 ? 'ADS' : 'USDT') as 'ADS' | 'USDT',
              stakeAmountRaw: m.stakeAmountAds || m.stakeAmountUsdt || 0,
              date: m.date,
              txnHash: m.txnHash,
              dailyRewardGenerated: m.dailyRewardGenerated || 0,
              commissionEarned: m.commissionEarned > 0 ? m.commissionEarned : (m.totalStakeUsd || m.stakeAmountUsdt || 0) * 0.10,
              isActive: m.isActive,
            })),
            ...(referrals.l2Members || []).filter(isDownlineValid).map((m: any, idx: number) => ({
              id: `l2_${idx}`,
              walletAddress: m.walletAddress,
              level: 2 as const,
              stakeAmount: m.totalStakeUsd || m.stakeAmountUsdt || 0,
              stakeToken: (m.stakeAmountAds > 0 ? 'ADS' : 'USDT') as 'ADS' | 'USDT',
              stakeAmountRaw: m.stakeAmountAds || m.stakeAmountUsdt || 0,
              date: m.date,
              txnHash: m.txnHash,
              dailyRewardGenerated: m.dailyRewardGenerated || 0,
              commissionEarned: m.commissionEarned > 0 ? m.commissionEarned : (m.totalStakeUsd || m.stakeAmountUsdt || 0) * 0.03,
              isActive: m.isActive,
            })),
            ...(referrals.l3Members || []).filter(isDownlineValid).map((m: any, idx: number) => ({
              id: `l3_${idx}`,
              walletAddress: m.walletAddress,
              level: 3 as const,
              stakeAmount: m.totalStakeUsd || m.stakeAmountUsdt || 0,
              stakeToken: (m.stakeAmountAds > 0 ? 'ADS' : 'USDT') as 'ADS' | 'USDT',
              stakeAmountRaw: m.stakeAmountAds || m.stakeAmountUsdt || 0,
              date: m.date,
              txnHash: m.txnHash,
              dailyRewardGenerated: m.dailyRewardGenerated || 0,
              commissionEarned: m.commissionEarned > 0 ? m.commissionEarned : (m.totalStakeUsd || m.stakeAmountUsdt || 0) * 0.02,
              isActive: m.isActive,
            })),
          ];

          if (allMembers.length > 0 || !localStorage.getItem(`adstoken_downlines_v2_${addr.toLowerCase()}`)) {
            setDownlineMembers(allMembers);
            if (allMembers.length > 0) {
              localStorage.setItem(`adstoken_downlines_v2_${addr.toLowerCase()}`, JSON.stringify(allMembers));
            }
          }

          if (referrals.summary) {
            if (referrals.summary.activeL1 !== undefined) setActiveL1Count(referrals.summary.activeL1);
            if (referrals.summary.activeL2 !== undefined) setActiveL2Count(referrals.summary.activeL2);
            if (referrals.summary.activeL3 !== undefined) setActiveL3Count(referrals.summary.activeL3);
            if (referrals.summary.directVolume !== undefined) setDirectVolumeAmount(referrals.summary.directVolume);
            if (referrals.summary.teamVolume !== undefined) setTotalTeamStakingVolume(referrals.summary.teamVolume);
            if (referrals.summary.eligibility) setReferralEligibility(referrals.summary.eligibility);
            localStorage.setItem(`adstoken_ref_summary_v2_${addr.toLowerCase()}`, JSON.stringify(referrals.summary));
          }

          if (referrals.tierIncome && referrals.tierIncome.history) {
            setTierIncomeRecords(
              referrals.tierIncome.history.map((h: any, idx: number) => ({
                id: h.id || `tier_${idx}`,
                downlineAddress: h.fromUserAddress || h.downlineAddress,
                downlineTier: h.downlineTier || 'V1',
                userTier: h.userTier || 'V3',
                differentialRate: h.differentialRate || 20,
                eligibleVolume: h.eligibleVolume || 10000,
                incomeReceived: h.bonusAmount || 0,
                token: h.token || 'ADS',
                date: typeof h.timestamp === 'number'
                  ? new Date(h.timestamp).toISOString().replace('T', ' ').slice(0, 19)
                  : (h.date || new Date().toISOString().replace('T', ' ').slice(0, 19)),
                txnHash: h.txHash || '0x' + h.id,
              }))
            );
          }
        }

        if (tierData) {
          if (tierData.currentTier) setUserCommunityTier(tierData.currentTier);
          if (tierData.bonusPercentage !== undefined) setUserTierBonusPercentage(tierData.bonusPercentage);
          if (tierData.personalStaking !== undefined) setPersonalStakingAmount(tierData.personalStaking);
          if (tierData.teamVolume !== undefined) setTotalTeamStakingVolume(tierData.teamVolume);
          if (tierData.weakLegVolume !== undefined) setWeakLegVolume(tierData.weakLegVolume);
          if (tierData.strongLegVolume !== undefined) setStrongLegVolume(tierData.strongLegVolume);
          if (tierData.nextTier !== undefined) setNextTierName(tierData.nextTier);
          if (tierData.nextTierRate !== undefined) setNextTierRate(tierData.nextTierRate);
          if (tierData.personalRequired !== undefined) setNextPersonalRequired(tierData.personalRequired);
          if (tierData.teamVolumeRequired !== undefined) setNextTeamVolumeRequired(tierData.teamVolumeRequired);
          if (tierData.personalProgress !== undefined) setPersonalProgressPct(tierData.personalProgress);
          if (tierData.teamProgress !== undefined) setTeamProgressPct(tierData.teamProgress);
          if (tierData.tierBreakdown) setTierBreakdownList(tierData.tierBreakdown);
          if (tierData.totalTierEarned !== undefined) setTotalTierEarnedAmount(tierData.totalTierEarned);
        }
      } catch (backendErr) {
        console.warn('Backend API connection notice:', backendErr);
      }

      // 2. Query On-Chain Web3 Provider for Live Wallet Token Balances & On-Chain Verification
      if (typeof (window as any).ethereum !== 'undefined') {
        const provider = new BrowserProvider((window as any).ethereum);
        const network = await provider.getNetwork();
        setIsTestnet(Number(network.chainId) === 97);

        const adsContract = new Contract(deployedAddresses.adsToken, ERC20_ABI, provider);
        const usdtContract = new Contract(deployedAddresses.usdtToken, ERC20_ABI, provider);
        const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, provider);

        const [rawAdsBal, rawUsdtBal, rawStakedAds, rawStakedUsdt, adsStakesCount, usdtStakesCount] = await Promise.all([
          adsContract.balanceOf(addr).catch(() => 0n),
          usdtContract.balanceOf(addr).catch(() => 0n),
          vaultContract.userStakedADS(addr).catch(() => 0n),
          vaultContract.userTotalStakedUsdt(addr).catch(() => 0n),
          vaultContract.getUserAdsStakesCount(addr).catch(() => 0n),
          vaultContract.getUserUsdtStakesCount(addr).catch(() => 0n),
        ]);

        setWalletAdsBalance(parseFloat(formatEther(rawAdsBal)).toFixed(2));
        setWalletUsdtBalance(parseFloat(formatEther(rawUsdtBal)).toFixed(2));

        // Always update staked balances from on-chain (even if 0 after unstake)
        setOnChainStakedAds(parseFloat(formatEther(rawStakedAds)).toFixed(2));
        setOnChainStakedUsdt(parseFloat(formatEther(rawStakedUsdt)).toFixed(2));

        // Always update plans count from on-chain
        const totalPlans = Number(adsStakesCount) + Number(usdtStakesCount);
        setActivePlansCount(totalPlans);

        let totalAdsPending = 0;
        const loadedAdsPlans: ActivePlanItem[] = [];
        const loadedAdsHistory: ActivePlanItem[] = [];
        const nowSec = Math.floor(Date.now() / 1000);

        for (let i = 0; i < Number(adsStakesCount); i++) {
          try {
            const [p, st] = await Promise.all([
              vaultContract.calculatePendingAdsReward(addr, i).catch(() => 0n),
              vaultContract.userAdsStakes(addr, i).catch(() => null),
            ]);
            const pendingReward = parseFloat(formatEther(p));
            totalAdsPending += pendingReward;

            if (st) {
              const claimed = parseFloat(formatEther(st.claimedRewards || 0n));
              const periodDays = Number(st.periodDays);
              const usdtAmt = parseFloat(formatEther(st.usdtDeposited));
              const adsAmt = parseFloat(formatEther(st.adsAmount));
              const startTime = Number(st.startTime);
              const maturityTime = Number(st.maturityTime);
              const isMatured = Boolean(st.isMatured);
              const principalWithdrawn = Boolean(st.principalWithdrawn);

              let roiText = '0.20% daily';
              let maxCapText = 'Flexible (No Lock)';
              if (periodDays === 30) {
                roiText = '0.40% daily';
                maxCapText = `${(adsAmt * 1.12).toFixed(0)} ADS (≈ $${(usdtAmt * 1.12).toFixed(0)} / 112%)`;
              } else if (periodDays === 90) {
                roiText = '0.60% daily';
                maxCapText = `${(adsAmt * 1.54).toFixed(0)} ADS (≈ $${(usdtAmt * 1.54).toFixed(0)} / 154%)`;
              } else if (periodDays === 180) {
                roiText = '0.80% daily';
                maxCapText = `${(adsAmt * 2.44).toFixed(0)} ADS (≈ $${(usdtAmt * 2.44).toFixed(0)} / 244%)`;
              } else if (periodDays === 360) {
                roiText = '1.00% daily';
                maxCapText = `${(adsAmt * 4.60).toFixed(0)} ADS (≈ $${(usdtAmt * 4.60).toFixed(0)} / 460%)`;
              }

              const stakeDate = startTime > 0
                ? new Date(startTime * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'Recent';

              const endDate = periodDays === 0
                ? 'Flexible'
                : (maturityTime > 0
                    ? new Date(maturityTime * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'Flexible');

              // A fixed-term plan is over when maturity is reached; a flexible plan is over when principal is withdrawn
              const isPeriodOver = periodDays > 0 && (nowSec >= maturityTime || isMatured);
              const isUnstaked = principalWithdrawn;
              const isHistoryItem = isUnstaked || isPeriodOver;

              const planItem: ActivePlanItem = {
                id: `ads_${i}`,
                stakeId: i,
                type: 'ADS',
                usdtAmount: usdtAmt,
                adsAmount: adsAmt,
                periodDays,
                periodLabel: periodDays === 0 ? 'Flexible' : `${periodDays} Days`,
                dailyRoiText: roiText,
                maxCapping: maxCapText,
                stakeDate,
                earningTillDate: `${(claimed + pendingReward).toFixed(2)} ADS`,
                endDate,
                isFlexible: periodDays === 0,
                isMatured: isPeriodOver,
                isWithdrawn: principalWithdrawn,
                startTime,
                status: isUnstaked ? 'UNSTAKED' : (isPeriodOver ? 'PERIOD_OVER' : 'ACTIVE'),
                statusText: isUnstaked ? 'Unstaked' : (isPeriodOver ? 'Period Completed' : 'Active'),
                completedDate: isUnstaked ? 'Unstaked' : (isPeriodOver ? endDate : undefined),
              };

              if (isHistoryItem) {
                loadedAdsHistory.push(planItem);
              } else {
                loadedAdsPlans.push(planItem);
              }
            }
          } catch (e) {
            console.warn(`Error reading ADS stake ${i}:`, e);
          }
        }
        setPendingAdsRewards(totalAdsPending.toFixed(4));
        setUserActiveAdsPlans(loadedAdsPlans);
        setUserHistoryAdsPlans(loadedAdsHistory);

        let totalUsdtPending = 0;
        const loadedUsdtPlans: ActivePlanItem[] = [];
        const loadedUsdtHistory: ActivePlanItem[] = [];

        for (let i = 0; i < Number(usdtStakesCount); i++) {
          try {
            const [p, st] = await Promise.all([
              vaultContract.calculatePendingUsdtReward(addr, i).catch(() => 0n),
              vaultContract.userUsdtStakes(addr, i).catch(() => null),
            ]);
            const pendingReward = parseFloat(formatEther(p));
            totalUsdtPending += pendingReward;

            if (st) {
              const amountUsdt = parseFloat(formatEther(st.amountUsdt));
              const startTime = Number(st.startTime);
              const maxRewardUsdt = parseFloat(formatEther(st.maxRewardUsdt));
              const claimed = parseFloat(formatEther(st.claimedRewardsUsdt || 0n));
              const isCompleted = Boolean(st.isCompleted);

              const stakeDate = startTime > 0
                ? new Date(startTime * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'Recent';

              const multiplier = amountUsdt >= 5001 ? '3.0X' : (amountUsdt >= 1001 ? '2.5X' : '2.0X');
              const maxCapVal = maxRewardUsdt > 0 ? maxRewardUsdt : (amountUsdt * (amountUsdt >= 5001 ? 3 : (amountUsdt >= 1001 ? 2.5 : 2)));
              const maxCapping = `$${maxCapVal.toFixed(0)} USDT (${multiplier} Cap)`;

              const isCapReached = maxRewardUsdt > 0 && (claimed + pendingReward >= maxRewardUsdt);
              const isUsdtOver = isCompleted || isCapReached;

              const usdtPlanItem: ActivePlanItem = {
                id: `usdt_${i}`,
                stakeId: i,
                type: 'USDT',
                usdtAmount: amountUsdt,
                adsAmount: amountUsdt * 2,
                periodDays: 0,
                periodLabel: 'USDT Staking',
                dailyRoiText: '1.00% daily',
                maxCapping,
                stakeDate,
                earningTillDate: `$${(claimed + pendingReward).toFixed(2)} USDT`,
                endDate: 'Non-Withdrawable (Cap Payout)',
                isFlexible: false,
                isMatured: isUsdtOver,
                isWithdrawn: false,
                startTime,
                status: isUsdtOver ? 'COMPLETED' : 'ACTIVE',
                statusText: isUsdtOver ? 'Cap Reached (Completed)' : 'Active',
                completedDate: isUsdtOver ? 'Completed' : undefined,
              };

              if (isUsdtOver) {
                loadedUsdtHistory.push(usdtPlanItem);
              } else {
                loadedUsdtPlans.push(usdtPlanItem);
              }
            }
          } catch (e) {
            console.warn(`Error reading USDT stake ${i}:`, e);
          }
        }
        setPendingUsdtRewards(totalUsdtPending.toFixed(4));
        setUserActiveUsdtPlans(loadedUsdtPlans);
        setUserHistoryUsdtPlans(loadedUsdtHistory);
        setUserActivePlans([...loadedAdsPlans, ...loadedUsdtPlans]);

        // Only count currently active (not over / not unstaked) plans as active stake!
        const activeAdsTotal = loadedAdsPlans.reduce((sum, p) => sum + p.adsAmount, 0);
        setOnChainStakedAds(activeAdsTotal > 0 ? activeAdsTotal.toFixed(2) : '0.00');

        const activeUsdtTotal = loadedUsdtPlans.reduce((sum, p) => sum + p.usdtAmount, 0);
        setOnChainStakedUsdt(activeUsdtTotal > 0 ? activeUsdtTotal.toFixed(2) : '0.00');

        setActivePlansCount(loadedAdsPlans.length + loadedUsdtPlans.length);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  // Connect Wallet Handler
  const handleConnectWallet = async (walletName = 'MetaMask') => {
    setShowWalletModal(false);
    if (typeof (window as any).ethereum !== 'undefined') {
      try {
        const provider = new BrowserProvider((window as any).ethereum);
        const accounts = await provider.send('eth_requestAccounts', []);
        if (accounts.length > 0) {
          const userAddr = accounts[0];
          setWalletAddress(userAddr);
          setIsConnected(true);

          const sponsorMsg = sponsorReferrer
            ? ` | Sponsor: ${sponsorReferrer.slice(0, 8)}...`
            : '';
          notify('success', `Connected: ${userAddr.slice(0, 6)}...${userAddr.slice(-4)}${sponsorMsg}`);
          loadBlockchainData(userAddr);
          handleCheckOrSwitchNetwork();
        }
      } catch (err: any) {
        notify('error', err.message || 'Wallet connection rejected');
      }
    } else {
      notify('error', 'Please install MetaMask or open inside Trust Wallet / MetaMask dApp browser.');
    }
  };

  const handleCheckOrSwitchNetwork = async () => {
    if (typeof (window as any).ethereum === 'undefined') return;
    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x61' }], // 97 in hex (BSC Testnet)
      });
      setIsTestnet(true);
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x61',
              chainName: 'BNB Smart Chain Testnet',
              nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
              rpcUrls: ['https://bsc-testnet.publicnode.com'],
              blockExplorerUrls: ['https://testnet.bscscan.com'],
            }],
          });
          setIsTestnet(true);
        } catch (addError) {
          console.error(addError);
        }
      }
    }
  };

  // Auto-connect if already authorized in MetaMask
  useEffect(() => {
    if (typeof (window as any).ethereum !== 'undefined') {
      (window as any).ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          setIsConnected(true);
          loadBlockchainData(accounts[0]);
        }
      });
    }
  }, []);

  // Free USDT Faucet
  const handleMintFaucetUSDT = async (amt = '1000') => {
    if (!isConnected) { setShowWalletModal(true); return; }
    try {
      setIsProcessing(true);
      setProcessingStep('Minting free demo USDT...');
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const usdtContract = new Contract(deployedAddresses.usdtToken, MOCK_USDT_ABI, signer);

      const tx = await usdtContract.mint(walletAddress, parseEther(amt));
      await tx.wait();
      notify('success', `✅ Minted ${amt} Free USDT to your wallet!`, tx.hash);
      loadBlockchainData(walletAddress);
    } catch (err: any) {
      notify('error', err.reason || err.message || 'Faucet mint failed');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Disconnect Wallet
  const handleDisconnectWallet = () => {
    setWalletAddress('');
    setIsConnected(false);
    setWalletAdsBalance('0.00');
    setWalletUsdtBalance('0.00');
    setOnChainStakedAds('0.00');
    setOnChainStakedUsdt('0.00');
    setPendingAdsRewards('0.0000');
    setPendingUsdtRewards('0.0000');
    setActivePlansCount(0);
    setUserActivePlans([]);
    setUserActiveAdsPlans([]);
    setUserActiveUsdtPlans([]);
    setUserHistoryAdsPlans([]);
    setUserHistoryUsdtPlans([]);
    setStakingViewTab('active');
    notify('info', 'Wallet disconnected successfully');
  };

  // 1-Click Custom Token to MetaMask
  const handleImportTokenToMetaMask = async (tokenType: 'ADS' | 'USDT') => {
    if (typeof (window as any).ethereum === 'undefined') {
      notify('error', 'Please install MetaMask to add custom tokens.');
      return;
    }
    try {
      const isAds = tokenType === 'ADS';
      const address = isAds ? deployedAddresses.adsToken : deployedAddresses.usdtToken;
      const symbol = isAds ? 'ADS' : 'USDT';
      const decimals = 18;

      notify('info', `Opening MetaMask to add ${symbol} token...`);
      const wasAdded = await (window as any).ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address,
            symbol,
            decimals,
          },
        },
      });
      if (wasAdded) {
        notify('success', `✅ Successfully added ${symbol} token to MetaMask!`);
      }
    } catch (e: any) {
      console.error(e);
      notify('error', e.message || `Failed to add ${tokenType} token`);
    }
  };



  // =========================================================================
  // ADS STAKING FLOW (Module 1 - Page 6)
  // Reward Percentage:
  // Flexible: 0.20%, 30d: 0.40%, 90d: 0.60%, 180d: 0.80%, 360d: 1.00%
  // =========================================================================
  const handleStartAdsStaking = async () => {
    const usdtAmt = parseFloat(stakeUsdtInput);
    if (!usdtAmt || usdtAmt <= 0) {
      notify('error', 'Please enter a valid USDT amount');
      return;
    }
    if (!isConnected) {
      setShowWalletModal(true);
      return;
    }

    try {
      setIsProcessing(true);
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const usdtContract = new Contract(deployedAddresses.usdtToken, ERC20_ABI, signer);
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);

      const parsedUsdt = parseEther(stakeUsdtInput);
      const expectedAds = usdtAmt * 2;

      setProcessingStep('Step 1/2: Approving USDT to Staking Vault...');
      notify('info', 'Step 1/2: Please approve USDT in MetaMask...');
      const approveUsdtTx = await usdtContract.approve(deployedAddresses.stakingVault, parsedUsdt);
      await approveUsdtTx.wait();

      setProcessingStep(`Step 2/2: Confirming Stake (${expectedAds.toLocaleString()} ADS Tracked at $0.50)...`);
      notify('info', `Step 2/2: Confirming deposit of ${usdtAmt} USDT (Locks ${expectedAds.toLocaleString()} ADS)...`);
      const stakeTx = await vaultContract.stakeWithUsdt(parsedUsdt, selectedAdsPeriod);
      await stakeTx.wait();

      // Record stake in Backend Calculation Engine
      await api.recordAdsStake({
        address: walletAddress,
        amount: expectedAds,
        periodDays: selectedAdsPeriod,
        referrer: sponsorReferrer,
        txHash: stakeTx.hash,
      }).catch((e) => console.warn('Backend stake-ads notice:', e.message));

      notify(
        'success',
        `🎉 Staked ${usdtAmt} USDT (Tracked as ${expectedAds.toLocaleString()} ADS) for ${selectedAdsPeriod === 0 ? 'Flexible' : selectedAdsPeriod + ' Days'} successfully! Rewards paid in ADS.`,
        stakeTx.hash
      );

      loadBlockchainData(walletAddress);
      setActiveTab('dashboard');
    } catch (err: any) {
      console.error(err);
      notify('error', err.reason || err.message || 'Staking failed. Please ensure you have test USDT and tBNB for gas.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // =========================================================================
  // USDT STAKING FLOW (Module 2 - Page 7)
  // Target daily payout: 1% daily
  // Multipliers: $10-$999: 2X, $1,000-$4,999: 2.5X, $5,000+: 3X
  // =========================================================================
  const handleStartUsdtStaking = async () => {
    const amt = parseFloat(usdtDepositInput);
    if (!amt || amt < 10) {
      notify('error', 'Minimum deposit is 10 USDT');
      return;
    }
    if (!isConnected) {
      setShowWalletModal(true);
      return;
    }

    try {
      setIsProcessing(true);
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const usdtContract = new Contract(deployedAddresses.usdtToken, ERC20_ABI, signer);
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);

      const parsedUsdt = parseEther(usdtDepositInput);

      setProcessingStep('Step 1/2: Approving USDT...');
      notify('info', 'Step 1/2: Approving USDT in MetaMask...');
      const approveTx = await usdtContract.approve(deployedAddresses.stakingVault, parsedUsdt);
      await approveTx.wait();

      setProcessingStep('Step 2/2: Confirming USDT Stake (80% Burn / 20% LP)...');
      notify('info', 'Step 2/2: Confirming USDT Stake at 1% Daily...');
      const stakeTx = await vaultContract.stakeUSDT(parsedUsdt);
      await stakeTx.wait();

      // Record stake in Backend Calculation Engine
      await api.recordUsdtStake({
        address: walletAddress,
        amountUsdt: amt,
        referrer: sponsorReferrer,
        txHash: stakeTx.hash,
      }).catch((e) => console.warn('Backend stake-usdt notice:', e.message));

      notify('success', `ðŸŽ‰ Staked ${amt} USDT at 1% Daily successfully!`, stakeTx.hash);

      loadBlockchainData(walletAddress);
      setActiveTab('dashboard');
    } catch (err: any) {
      console.error(err);
      notify('error', err.reason || err.message || 'USDT Staking failed');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // =========================================================================
  // WITHDRAWAL FLOW WITH 3% SALES TAX DEDUCTION (Whitepaper Page 6, 7 & 12)
  // =========================================================================
  const handleWithdrawal = async () => {
    if (!isConnected) { setShowWalletModal(true); return; }
    try {
      setIsProcessing(true);
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);

      const grossAmount = withdrawToken === 'ADS' ? parseFloat(pendingAdsRewards) : parseFloat(pendingUsdtRewards);
      const taxAmount = (grossAmount * 0.03).toFixed(2);
      const netAmount = (grossAmount * 0.97).toFixed(2);

      if (withdrawToken === 'ADS') {
        setProcessingStep(`Withdrawing ADS (${taxAmount} ADS 3% Tax to Treasury)...`);
        notify('info', `Claiming ADS Rewards: 3% Sales Tax (${taxAmount} ADS) will be deducted...`);
        const tx = await vaultContract.claimAdsRewards();
        await tx.wait();

        setPendingAdsRewards('0.0000');

        await api.recordWithdrawal({
          address: walletAddress,
          token: 'ADS',
          amount: grossAmount,
        }).catch((e) => console.warn('Backend withdrawal record notice:', e.message));

        notify(
          'success',
          `✅ Withdrawn! Gross: ${grossAmount.toFixed(2)} ADS | 3% Sales Tax: -${taxAmount} ADS | Net Credited: ${netAmount} ADS`,
          tx.hash
        );
      } else {
        const usdtTax = (grossAmount * 0.03).toFixed(2);
        const usdtNet = (grossAmount * 0.97).toFixed(2);
        setProcessingStep(`Withdrawing USDT Rewards (${usdtTax} USDT 3% Tax to Treasury)...`);
        notify('info', `Claiming USDT Staking Rewards: 3% Sales Tax (${usdtTax} USDT) will be deducted...`);
        const tx = await vaultContract.claimUsdtRewards();
        await tx.wait();

        setPendingUsdtRewards('0.0000');

        await api.recordWithdrawal({
          address: walletAddress,
          token: 'USDT',
          amount: grossAmount,
        }).catch((e) => console.warn('Backend withdrawal record notice:', e.message));

        notify(
          'success',
          `✅ Withdrawn! Gross: ${grossAmount.toFixed(2)} USDT | 3% Sales Tax: -${usdtTax} USDT | Net Credited: ${usdtNet} USDT`,
          tx.hash
        );
      }
      await loadBlockchainData(walletAddress);
    } catch (err: any) {
      notify('error', err.reason || err.message || 'Withdrawal failed. Make sure you have accrued rewards.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Unstake Flexible ADS Staking Plan Individually (Only Flexible ADS Module allows unstake)
  const handleUnstakeAds = async (stakeId: number) => {
    if (!isConnected) {
      setShowWalletModal(true);
      return;
    }
    try {
      setIsProcessing(true);
      setProcessingStep(`Unstaking Flexible ADS Staking Plan #${stakeId + 1}...`);

      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);

      notify('info', `Unstaking Flexible ADS Plan #${stakeId + 1}... Please confirm transaction in MetaMask.`);
      const tx = await vaultContract.withdrawAdsPrincipal(stakeId);
      await tx.wait();
      notify('success', `✅ Flexible ADS Plan #${stakeId + 1} Unstaked! Principal returned to your wallet.`, tx.hash);

      // Optimistic update: move plan from active to history immediately
      setUserActiveAdsPlans(prev => {
        const unstakedPlan = prev.find(p => p.stakeId === stakeId);
        const updated = prev.filter(p => p.stakeId !== stakeId);
        if (unstakedPlan) {
          setUserHistoryAdsPlans(hPrev => [
            {
              ...unstakedPlan,
              isWithdrawn: true,
              status: 'UNSTAKED',
              statusText: 'Unstaked',
              completedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            },
            ...hPrev.filter(h => h.stakeId !== stakeId)
          ]);
        }
        const remainingAds = updated.reduce((sum, p) => sum + p.adsAmount, 0);
        setOnChainStakedAds(remainingAds > 0 ? remainingAds.toFixed(2) : '0.00');
        return updated;
      });

      await loadBlockchainData(walletAddress);
    } catch (err: any) {
      console.error(err);
      notify('error', err.reason || err.message || `Unstake failed for Plan #${stakeId + 1}. Only Flexible staking plans can withdraw principal.`);
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };
  const handleUnstakeFlexible = handleUnstakeAds;

  // =========================================================================
  // SWAP FUNCTIONS — ADS ↔ USDT
  // =========================================================================

  /** Load live liquidity balances of the swap contract */
  const loadSwapLiquidity = async () => {
    try {
      if (typeof (window as any).ethereum === 'undefined') return;
      const provider = new BrowserProvider((window as any).ethereum);
      const adsContract = new Contract(deployedAddresses.adsToken, ERC20_ABI, provider);
      const usdtContract = new Contract(deployedAddresses.usdtToken, ERC20_ABI, provider);
      const [rawAds, rawUsdt] = await Promise.all([
        adsContract.balanceOf(deployedAddresses.adsSwap).catch(() => 0n),
        usdtContract.balanceOf(deployedAddresses.adsSwap).catch(() => 0n),
      ]);
      setSwapContractLiquidity({
        ads: parseFloat(formatEther(rawAds)).toFixed(2),
        usdt: parseFloat(formatEther(rawUsdt)).toFixed(2),
      });
    } catch (e) {
      console.warn('Could not load swap liquidity:', e);
    }
  };

  /** Live estimation when user types in swap input */
  const handleSwapInputChange = (val: string) => {
    setSwapInputAmount(val);
    const amount = parseFloat(val) || 0;
    if (amount <= 0) {
      setSwapEstimatedOutput('');
      setSwapTaxAmount('');
      return;
    }
    if (swapDirection === 'USDT_TO_ADS') {
      // 1 USDT = 2 ADS, no tax on buy
      const adsOut = amount * 2;
      setSwapEstimatedOutput(adsOut.toFixed(4));
      setSwapTaxAmount('0');
      setSwapRate('1 USDT = 2 ADS');
    } else {
      // 2 ADS = 1 USDT, no sell tax
      const usdtOut = amount / 2;
      setSwapEstimatedOutput(usdtOut.toFixed(4));
      setSwapTaxAmount('0');
      setSwapRate('2 ADS = 1 USDT');
    }
  };

  /** Flip swap direction (USDT→ADS ⇌ ADS→USDT) */
  const handleFlipSwapDirection = () => {
    const newDir: 'USDT_TO_ADS' | 'ADS_TO_USDT' =
      swapDirection === 'USDT_TO_ADS' ? 'ADS_TO_USDT' : 'USDT_TO_ADS';
    setSwapDirection(newDir);
    setSwapInputAmount('');
    setSwapEstimatedOutput('');
    setSwapTaxAmount('');
    setSwapRate(newDir === 'USDT_TO_ADS' ? '1 USDT = 2 ADS' : '2 ADS = 1 USDT');
  };

  /** Execute USDT → ADS swap on-chain */
  const handleSwapUSDTForADS = async () => {
    const amount = parseFloat(swapInputAmount);
    if (!amount || amount <= 0) { notify('error', 'Enter a valid USDT amount'); return; }
    if (!isConnected) { setShowWalletModal(true); return; }

    const minOutputAds = (amount * 2) * (1 - swapSlippage / 100);

    // Slippage check against contract liquidity
    if (parseFloat(swapContractLiquidity.ads) < amount * 2) {
      notify('error', `Insufficient ADS liquidity in swap contract. Available: ${swapContractLiquidity.ads} ADS`);
      return;
    }

    try {
      setIsProcessing(true);
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const usdtContract = new Contract(deployedAddresses.usdtToken, ERC20_ABI, signer);
      const swapContract = new Contract(deployedAddresses.adsSwap, SWAP_ABI, signer);

      const parsedAmount = parseEther(swapInputAmount);

      setProcessingStep('Step 1/2: Approving USDT...');
      notify('info', `Step 1/2: Approve ${amount} USDT in MetaMask...`);
      const approveTx = await usdtContract.approve(deployedAddresses.adsSwap, parsedAmount);
      await approveTx.wait();

      setProcessingStep(`Step 2/2: Swapping USDT → ADS (Min: ${minOutputAds.toFixed(2)} ADS)...`);
      notify('info', 'Step 2/2: Confirming swap in MetaMask...');
      const swapTx = await swapContract.swapUSDTForADS(parsedAmount);
      await swapTx.wait();

      notify('success', `✅ Swapped ${amount} USDT → ${(amount * 2).toFixed(2)} ADS successfully!`, swapTx.hash);
      setSwapInputAmount('');
      setSwapEstimatedOutput('');
      setSwapTaxAmount('');
      await loadBlockchainData(walletAddress);
      await loadSwapLiquidity();
    } catch (err: any) {
      notify('error', err.reason || err.message || 'Swap failed. Ensure you have sufficient USDT and tBNB for gas.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  /** Execute ADS → USDT swap on-chain (no sell tax) */
  const handleSwapADSForUSDT = async () => {
    const amount = parseFloat(swapInputAmount);
    if (!amount || amount < 2) { notify('error', 'Minimum 2 ADS required for swap'); return; }
    if (!isConnected) { setShowWalletModal(true); return; }

    const usdtOut = amount / 2;
    const minOutputUsdt = usdtOut * (1 - swapSlippage / 100);

    // Slippage check against contract liquidity
    if (parseFloat(swapContractLiquidity.usdt) < usdtOut) {
      notify('error', `Insufficient USDT liquidity. Available: ${swapContractLiquidity.usdt} USDT`);
      return;
    }

    try {
      setIsProcessing(true);
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const adsContract = new Contract(deployedAddresses.adsToken, ERC20_ABI, signer);
      const swapContract = new Contract(deployedAddresses.adsSwap, SWAP_ABI, signer);

      const parsedAmount = parseEther(swapInputAmount);

      setProcessingStep('Step 1/2: Approving ADS...');
      notify('info', `Step 1/2: Approve ${amount} ADS in MetaMask...`);
      const approveTx = await adsContract.approve(deployedAddresses.adsSwap, parsedAmount);
      await approveTx.wait();

      setProcessingStep(`Step 2/2: Swapping ADS → USDT (Min: ${minOutputUsdt.toFixed(2)} USDT)...`);
      notify('info', 'Step 2/2: Confirming swap in MetaMask...');
      const swapTx = await swapContract.swapADSForUSDT(parsedAmount);
      await swapTx.wait();

      notify('success', `✅ Swapped ${amount} ADS → ${usdtOut.toFixed(4)} USDT successfully!`, swapTx.hash);
      setSwapInputAmount('');
      setSwapEstimatedOutput('');
      setSwapTaxAmount('');
      await loadBlockchainData(walletAddress);
      await loadSwapLiquidity();
    } catch (err: any) {
      notify('error', err.reason || err.message || 'Swap failed. Ensure sufficient ADS balance and tBNB for gas.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Add Test Downline Stake (Processed authoritatively via Backend API with offline fallback)
  const handleAddTestDownline = async (level: 1 | 2 | 3) => {
    try {
      if (!walletAddress) {
        setShowWalletModal(true);
        notify('info', 'Please connect your wallet first to add a test downline.');
        return;
      }
      setIsProcessing(true);
      setProcessingStep(`Adding Demo Level ${level} Member...`);
      const stakeAmt = [500, 1000, 2500, 5000][Math.floor(Math.random() * 4)];
      const rate = level === 1 ? 0.10 : level === 2 ? 0.03 : 0.02;
      const commEarned = stakeAmt * rate;

      let backendSuccess = false;
      try {
        await api.addTestDownline({
          sponsorAddress: walletAddress,
          level,
          amount: stakeAmt,
          token: 'USDT',
        });
        backendSuccess = true;
        notify('success', `Added new Level ${level} Member (${stakeAmt} USDT) — Earned $${commEarned.toFixed(2)} (${rate * 100}% of stake)!`);
        await loadBlockchainData(walletAddress);
      } catch (backendErr) {
        console.warn('Backend unavailable, saving demo downline locally in persistent client storage:', backendErr);
      }

      // If backend was unreachable (e.g. offline or Vercel deployed mode without local server running)
      if (!backendSuccess) {
        const mockAddr = '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        const newMember: DownlineMember = {
          id: `demo_l${level}_${Date.now()}`,
          walletAddress: mockAddr,
          level,
          stakeAmount: stakeAmt,
          stakeToken: 'USDT',
          stakeAmountRaw: stakeAmt,
          date: new Date().toISOString().replace('T', ' ').slice(0, 19),
          txnHash: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
          dailyRewardGenerated: stakeAmt * 0.01,
          commissionEarned: commEarned,
          isActive: true,
        };

        setDownlineMembers((prev) => {
          const updated = [...prev, newMember];
          localStorage.setItem(`adstoken_downlines_v2_${walletAddress.toLowerCase()}`, JSON.stringify(updated));
          return updated;
        });
        notify('success', `Added new Level ${level} Member (${stakeAmt} USDT) — Earned $${commEarned.toFixed(2)} (${rate * 100}% of stake)!`);
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to add test downline');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Reset Team Data (Resets authoritatively in Backend DB & LocalStorage)
  const handleResetTeamData = async () => {
    try {
      if (!walletAddress) {
        setShowWalletModal(true);
        notify('info', 'Please connect your wallet first to reset team data.');
        return;
      }
      setIsProcessing(true);
      try {
        await api.resetUserData(walletAddress);
      } catch (e) {
        console.warn('Backend reset call note:', e);
      }
      localStorage.removeItem('adstoken_downlines_v2');
      localStorage.removeItem(`adstoken_downlines_v2_${walletAddress.toLowerCase()}`);
      localStorage.removeItem(`adstoken_ref_summary_v2_${walletAddress.toLowerCase()}`);
      localStorage.removeItem('adstoken_tier_income_v2');
      setDownlineMembers([]);
      notify('info', 'Team data reset successfully. Reloading state...');
      await loadBlockchainData(walletAddress);
    } catch (err: any) {
      notify('error', err.message || 'Failed to reset team data');
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculations for ADS Staking Flow
  const parsedUsdtStake = parseFloat(stakeUsdtInput) || 0;
  const calculatedAdsQuantity = parsedUsdtStake * 2;
  const selectedPlanRoiPercent = useMemo(() => {
    switch (selectedAdsPeriod) {
      case 0: return 0.20;
      case 30: return 0.40;
      case 90: return 0.60;
      case 180: return 0.80;
      case 360: return 1.00;
      default: return 0.20;
    }
  }, [selectedAdsPeriod]);
  const adsDailyReward = (calculatedAdsQuantity * selectedPlanRoiPercent) / 100;
  const adsTotalPeriodReward = selectedAdsPeriod > 0 ? adsDailyReward * selectedAdsPeriod : 0;

  // Calculations for USDT Staking Flow
  const parsedUsdtDeposit = parseFloat(usdtDepositInput) || 0;
  const usdtDailyReward = parsedUsdtDeposit * 0.01;
  let usdtMultiplier = '2X';
  let usdtPlanRange = '$10 - $999';
  let usdtMaxReturn = parsedUsdtDeposit * 2;
  if (parsedUsdtDeposit >= 5000) {
    usdtMultiplier = '3X';
    usdtPlanRange = '$5,000 & above';
    usdtMaxReturn = parsedUsdtDeposit * 3;
  } else if (parsedUsdtDeposit >= 1000) {
    usdtMultiplier = '2.5X';
    usdtPlanRange = '$1,000 - $4,999';
    usdtMaxReturn = parsedUsdtDeposit * 2.5;
  }

  // 3% Tax Calculations for Withdrawal Tab
  const activeRewardGross = withdrawToken === 'ADS' ? parseFloat(pendingAdsRewards) || 0 : parseFloat(pendingUsdtRewards) || 0;
  const tax3Percent = activeRewardGross * 0.03;
  const netRewardAfter97 = activeRewardGross * 0.97;

  // Referral URL Generation — Mobile Wallet Compatible
  // MetaMask/Trust Wallet mobile browsers sometimes strip query params on deep-link open.
  // We generate BOTH formats so either works:
  //   Primary:  https://site.com?ref=0xABC...   (standard browsers + desktop MetaMask)
  //   Fallback: https://site.com/#ref=0xABC...   (MetaMask mobile, Trust Wallet dApp browser)
  const referralUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const base = `${window.location.origin}${window.location.pathname}`;
    return walletAddress ? `${base}?ref=${walletAddress}` : '';
  }, [walletAddress]);

  // Hash-based referral URL for MetaMask Mobile / Trust Wallet deep links
  const referralUrlHash = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const base = `${window.location.origin}${window.location.pathname}`;
    return walletAddress ? `${base}#ref=${walletAddress}` : '';
  }, [walletAddress]);

  // Filtered Downline Members by Level
  const l1Members = useMemo(() => downlineMembers.filter((m) => m.level === 1), [downlineMembers]);
  const l2Members = useMemo(() => downlineMembers.filter((m) => m.level === 2), [downlineMembers]);
  const l3Members = useMemo(() => downlineMembers.filter((m) => m.level === 3), [downlineMembers]);

  // Aggregate Stats for L1, L2, L3 Summary
  const l1TotalIncome = useMemo(() => l1Members.reduce((sum, m) => sum + m.commissionEarned, 0), [l1Members]);
  const l2TotalIncome = useMemo(() => l2Members.reduce((sum, m) => sum + m.commissionEarned, 0), [l2Members]);
  const l3TotalIncome = useMemo(() => l3Members.reduce((sum, m) => sum + m.commissionEarned, 0), [l3Members]);

  const l1TotalVolume = useMemo(() => l1Members.reduce((sum, m) => sum + m.stakeAmount, 0), [l1Members]);
  const l2TotalVolume = useMemo(() => l2Members.reduce((sum, m) => sum + m.stakeAmount, 0), [l2Members]);
  const l3TotalVolume = useMemo(() => l3Members.reduce((sum, m) => sum + m.stakeAmount, 0), [l3Members]);

  const totalReferralIncome = l1TotalIncome + l2TotalIncome + l3TotalIncome;
  const totalTeamMembers = l1Members.length + l2Members.length + l3Members.length;
  const totalTeamVolume = l1TotalVolume + l2TotalVolume + l3TotalVolume;

  // Filtered List based on Search Query
  const displayedReportMembers = useMemo(() => {
    const list = selectedReportLevel === 1 ? l1Members : selectedReportLevel === 2 ? l2Members : l3Members;
    if (!reportSearchQuery.trim()) return list;
    const q = reportSearchQuery.toLowerCase();
    return list.filter((m) => m.walletAddress.toLowerCase().includes(q) || m.txnHash.toLowerCase().includes(q));
  }, [selectedReportLevel, l1Members, l2Members, l3Members, reportSearchQuery]);

  // Community Tier Income Breakdown (Backend-Synchronized)
  const tierIncomeByTier = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {
      V1: { total: 0, count: 0 },
      V2: { total: 0, count: 0 },
      V3: { total: 0, count: 0 },
      V4: { total: 0, count: 0 },
      V5: { total: 0, count: 0 },
      V6: { total: 0, count: 0 },
    };
    if (tierBreakdownList.length > 0) {
      tierBreakdownList.forEach((b) => {
        if (map[b.tier]) {
          map[b.tier] = { total: b.totalEarned, count: b.count };
        }
      });
    } else {
      tierIncomeRecords.forEach((r) => {
        if (map[r.downlineTier]) {
          map[r.downlineTier].total += r.incomeReceived;
          map[r.downlineTier].count += 1;
        }
      });
    }
    return map;
  }, [tierBreakdownList, tierIncomeRecords]);

  const totalTierIncomeReceived = useMemo(() => {
    if (totalTierEarnedAmount > 0) return totalTierEarnedAmount;
    return tierIncomeRecords.reduce((sum, r) => sum + r.incomeReceived, 0);
  }, [totalTierEarnedAmount, tierIncomeRecords]);

  // Active plans sourced 100% from blockchain — strictly separated by mode (ADS vs USDT)
  // Recent stakes come first at the top (reverse chronological order)
  const displayedActivePlans = useMemo(() => {
    const plans = dashboardMode === 'ads' ? userActiveAdsPlans : userActiveUsdtPlans;
    return [...plans].sort((a, b) => {
      const timeA = a.startTime || 0;
      const timeB = b.startTime || 0;
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return b.stakeId - a.stakeId;
    });
  }, [dashboardMode, userActiveAdsPlans, userActiveUsdtPlans]);

  // History plans (completed periods or unstaked) — strictly separated by mode
  // Recent completed/unstaked come first at top
  const displayedHistoryPlans = useMemo(() => {
    const plans = dashboardMode === 'ads' ? userHistoryAdsPlans : userHistoryUsdtPlans;
    return [...plans].sort((a, b) => {
      const timeA = a.startTime || 0;
      const timeB = b.startTime || 0;
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return b.stakeId - a.stakeId;
    });
  }, [dashboardMode, userHistoryAdsPlans, userHistoryUsdtPlans]);

  return (
    <div className="min-h-screen bg-[#090d14] text-slate-100 flex flex-col items-center justify-start font-sans antialiased selection:bg-blue-600 selection:text-white">

      {/* MOBILE CONTAINER FRAME */}
      <div className="w-full max-w-md min-h-screen bg-[#0f141d] border-x border-slate-800/80 flex flex-col shadow-2xl relative pb-28">

        {/* TOP STATUS BAR / HEADER */}
        <header className="sticky top-0 z-40 bg-[#0f141d]/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/ads-logo.png"
              alt="ADSVILLA"
              className="w-8 h-8 rounded-full object-cover shadow-lg border border-amber-500/40"
            />
            <div>
              <div className="text-xs font-black tracking-wider uppercase text-white flex items-center gap-1.5">
                ADSVILLA
                <span className="text-[9px] bg-blue-500/20 text-blue-400 font-bold px-1.5 py-0.2 rounded border border-blue-500/30">v2.0</span>
              </div>
              <div className="text-[10px] text-slate-400 font-medium">Staking Protocol</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isConnected ? (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-full px-2.5 py-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[11px] font-mono font-semibold text-slate-200">
                    {walletAddress.slice(0, 5)}...{walletAddress.slice(-4)}
                  </span>
                </div>
                <button
                  onClick={handleDisconnectWallet}
                  title="Disconnect Wallet"
                  className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold px-2 py-1 rounded-full transition-all flex items-center gap-1 shadow-sm"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Exit</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowWalletModal(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/30"
              >
                <Wallet className="w-3.5 h-3.5" />
                Connect
              </button>
            )}
          </div>
        </header>

        {/* SPONSOR / REFERRAL BANNER (If user connected via ?ref=0x7bee32) */}
        {sponsorReferrer && sponsorReferrer.toLowerCase() !== walletAddress.toLowerCase() && (
          <div className="mx-3 mt-2.5 px-3 py-2 rounded-xl bg-blue-950/70 border border-blue-500/40 text-[11px] flex items-center justify-between text-blue-200 shadow-sm animate-in fade-in">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="font-semibold text-slate-300">Joined via Sponsor:</span>
              <span className="font-mono font-bold text-blue-300 truncate">
                {sponsorReferrer.length > 12 ? `${sponsorReferrer.slice(0, 8)}...${sponsorReferrer.slice(-4)}` : sponsorReferrer}
              </span>
            </div>
            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold px-1.5 py-0.5 rounded shrink-0">
              Active
            </span>
          </div>
        )}


        {/* NOTIFICATION TOAST */}
        {notification && (
          <div className={`mx-3 mt-2 p-3 rounded-xl text-xs font-semibold flex items-start gap-2.5 shadow-lg border animate-in fade-in slide-in-from-top-2 z-50 ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
              : notification.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
              : 'bg-blue-950/90 text-blue-200 border-blue-500/40'
          }`}>
            {notification.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : notification.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <RefreshCw className="w-4 h-4 text-blue-400 shrink-0 mt-0.5 animate-spin" />
            )}
            <div className="flex-1">
              <div>{notification.message}</div>
              {notification.txHash && (
                <a
                  href={`https://testnet.bscscan.com/tx/${notification.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-[10px] text-blue-300 block mt-1 hover:text-white"
                >
                  View on BscScan ↗
                </a>
              )}
            </div>
          </div>
        )}

        {/* QUICK FAUCET CHIP */}
        <div className="px-4 pt-2.5 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>USDT: <strong className="text-amber-400">${walletUsdtBalance}</strong></span>
            <span>ADS: <strong className="text-emerald-400">{walletAdsBalance}</strong></span>
          </div>
          <button
            onClick={() => handleMintFaucetUSDT('1000')}
            disabled={isProcessing}
            className="flex items-center gap-1 text-[10px] bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold px-2 py-0.5 rounded-full hover:bg-amber-500/25 transition-all"
          >
            <Droplets className="w-3 h-3 text-amber-400" />
            +1,000 Free USDT
          </button>
        </div>

        {/* MAIN BODY SCROLLABLE AREA */}
        <main className="flex-1 p-4 space-y-4">

          {/* ================================================================= */}
          {/* TAB 1: DASHBOARD (Matching Step 4 in Whitepaper v2.0 Page 6 & 7)   */}
          {/* ================================================================= */}
          {activeTab === 'dashboard' && (
            <div className="space-y-4 animate-in fade-in duration-200">

              {/* MODE SELECTOR WITH REAL LOGOS */}
              <div className="p-1 rounded-xl bg-slate-900 border border-slate-800 flex gap-1">
                <button
                  onClick={() => setDashboardMode('ads')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                    dashboardMode === 'ads'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <img src="/ads-logo.png" alt="ADS" className="w-4 h-4 rounded-full object-cover" />
                  ADS Staking
                </button>
                <button
                  onClick={() => setDashboardMode('usdt')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                    dashboardMode === 'usdt'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <img src="/usdt-logo.png" alt="USDT" className="w-4 h-4 rounded-full object-cover" />
                  USDT (1% Daily)
                </button>
              </div>

              {/* ── TOP STAT CARDS (STRICTLY ISOLATED BY MODE) ── */}
              <div className="grid grid-cols-2 gap-3">
                {/* My Stake */}
                <div className={`bg-[#141b27] border rounded-2xl p-3.5 flex items-start gap-3 ${dashboardMode === 'ads' ? 'border-blue-900/60' : 'border-emerald-900/60'}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${dashboardMode === 'ads' ? 'bg-blue-600/20' : 'bg-emerald-500/15'}`}>
                    <img
                      src={dashboardMode === 'ads' ? '/ads-logo.png' : '/usdt-logo.png'}
                      alt="Token"
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold">
                      {dashboardMode === 'ads' ? 'My ADS Stake' : 'My USDT Stake'}
                    </div>
                    <div className="text-sm font-black text-white leading-tight">
                      {dashboardMode === 'ads'
                        ? `${onChainStakedAds} ADS`
                        : `$${onChainStakedUsdt} USDT`}
                    </div>
                    <div className={`text-[10px] font-bold mt-0.5 ${dashboardMode === 'ads' ? 'text-blue-400' : 'text-emerald-400'}`}>
                      {dashboardMode === 'ads'
                        ? `(≈ $${(parseFloat(onChainStakedAds) * 0.50).toFixed(0)})`
                        : '100% Capital in Pool'}
                    </div>
                  </div>
                </div>

                {/* Total Reward */}
                <div className={`bg-[#141b27] border rounded-2xl p-3.5 flex items-start gap-3 ${dashboardMode === 'ads' ? 'border-blue-900/60' : 'border-emerald-900/60'}`}>
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                    <Gift className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold">
                      {dashboardMode === 'ads' ? 'Total ADS Reward' : 'Total USDT Reward'}
                    </div>
                    <div className={`text-sm font-black leading-tight ${dashboardMode === 'ads' ? 'text-blue-400' : 'text-emerald-400'}`}>
                      {dashboardMode === 'ads' ? `${pendingAdsRewards} ADS` : `$${pendingUsdtRewards} USDT`}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      ≈ ${dashboardMode === 'ads'
                        ? (parseFloat(pendingAdsRewards) * 0.50).toFixed(2)
                        : parseFloat(pendingUsdtRewards).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── ACTIVE PLANS BANNER ── */}
              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dashboardMode === 'ads' ? 'bg-blue-600/20' : 'bg-emerald-500/20'}`}>
                    <Layers className={`w-5 h-5 ${dashboardMode === 'ads' ? 'text-blue-400' : 'text-emerald-400'}`} />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold">
                      {dashboardMode === 'ads' ? 'Active ADS Plans' : 'Active USDT Plans'}
                    </div>
                    <div className="text-2xl font-black text-white">
                      {dashboardMode === 'ads' ? userActiveAdsPlans.length : userActiveUsdtPlans.length}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {walletAddress && (
                    <button
                      onClick={() => loadBlockchainData(walletAddress)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
                      title="Sync"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  )}
                  <div className="p-2 rounded-xl bg-slate-800/50 border border-slate-700/60">
                    <FileText className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              </div>

              {/* ── PENDING ACCRUED REWARDS (ONLY SELECTED TOKEN) ── */}
              <div className="bg-[#141b27] border border-slate-700 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    {dashboardMode === 'ads' ? 'Pending Accrued ADS Rewards' : 'Pending Accrued USDT Rewards'}
                  </span>
                  <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                    ⚡ 3% Sales Tax
                  </span>
                </div>

                {dashboardMode === 'ads' ? (
                  <div className="bg-[#0e141f] border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                    <img
                      src="/ads-logo.png"
                      alt="ADS"
                      className="w-10 h-10 rounded-full object-cover shadow-lg border border-amber-500/40 shrink-0"
                    />
                    <div className="flex-1">
                      <div className="text-[10px] text-slate-400 font-semibold">Available ADS Rewards</div>
                      <div className="text-base font-black text-white leading-tight">{pendingAdsRewards} ADS</div>
                      <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                        Net: {(parseFloat(pendingAdsRewards) * 0.97).toFixed(2)} ADS (3% Tax Deducted to Treasury)
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#0e141f] border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                    <img
                      src="/usdt-logo.png"
                      alt="USDT"
                      className="w-10 h-10 rounded-full object-cover shadow-lg border border-emerald-500/40 shrink-0"
                    />
                    <div className="flex-1">
                      <div className="text-[10px] text-slate-400 font-semibold">Available USDT Rewards</div>
                      <div className="text-base font-black text-emerald-400 leading-tight">${pendingUsdtRewards} USDT</div>
                      <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                        Net: ${(parseFloat(pendingUsdtRewards) * 0.97).toFixed(2)} USDT (3% Tax Deducted to Treasury)
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    setWithdrawToken(dashboardMode === 'ads' ? 'ADS' : 'USDT');
                    setActiveTab('withdrawal');
                  }}
                  className="w-full py-2.5 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-700"
                >
                  Withdraw {dashboardMode === 'ads' ? 'ADS Rewards' : 'USDT Rewards'} (3% Tax Deducted)
                  <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                </button>
              </div>

              {/* ── MIDDLE STATS (MODE-SPECIFIC) ── */}
              {dashboardMode === 'ads' ? (
                /* ADS MODE: Referral Income + Community Tier */
                <div className="grid grid-cols-2 gap-3">
                  {/* Referral Income */}
                  <div className="bg-[#141b27] border border-violet-900/50 rounded-2xl p-3.5 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-600/15 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold">Team Referral Income</div>
                      <div className="text-sm font-black text-violet-400 leading-tight">
                        {totalReferralIncome.toFixed(2)} ADS
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        ${(totalReferralIncome * 0.5).toFixed(2)} · Lifetime Earned
                      </div>
                    </div>
                  </div>

                  {/* Community Tier */}
                  <div className="bg-[#141b27] border border-amber-900/50 rounded-2xl p-3.5 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                      <Award className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold">Community Tier</div>
                      <div className="text-sm font-black text-amber-400 leading-tight">
                        {totalTierIncomeReceived.toFixed(2)} ADS
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        ${(totalTierIncomeReceived * 0.5).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* USDT MODE: Daily Rate + Multiplier Caps */
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#141b27] border border-emerald-900/50 rounded-2xl p-3.5 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold">Daily Return Rate</div>
                      <div className="text-sm font-black text-emerald-400 leading-tight">1.00% Daily</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Daily ROI</div>
                    </div>
                  </div>

                  <div className="bg-[#141b27] border border-emerald-900/50 rounded-2xl p-3.5 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                      <Flame className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold">Max Multiplier Cap</div>
                      <div className="text-sm font-black text-amber-300 leading-tight">2.0X / 2.5X / 3.0X</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Capped Payout</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STAKING PLANS / POSITIONS LIST (MODE-ISOLATED & ACTIVE vs HISTORY SEPARATION) ── */}
              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">

                {/* Header with Active / History Switcher */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={dashboardMode === 'ads' ? '/ads-logo.png' : '/usdt-logo.png'}
                      alt="Logo"
                      className="w-9 h-9 rounded-full object-cover border border-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white truncate">
                        {dashboardMode === 'ads'
                          ? (stakingViewTab === 'active' ? 'Current ADS Staking' : 'ADS Staking History')
                          : (stakingViewTab === 'active' ? 'Current USDT Staking' : 'USDT Staking History')}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {stakingViewTab === 'active'
                          ? (dashboardMode === 'ads' ? 'Active positions earning daily rewards' : '1.00% daily earnings active up to 2X-3X cap')
                          : (dashboardMode === 'ads' ? 'Past completed periods & unstaked plans' : 'Completed 100% cap payout positions')}
                      </div>
                    </div>
                  </div>

                  {/* Active vs History Switcher Pills */}
                  <div className="flex items-center bg-[#090e18] p-1 rounded-xl border border-slate-800 shrink-0">
                    <button
                      onClick={() => setStakingViewTab('active')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                        stakingViewTab === 'active'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span>Active</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-black/30 rounded-full font-semibold">
                        {displayedActivePlans.length}
                      </span>
                    </button>
                    <button
                      onClick={() => setStakingViewTab('history')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                        stakingViewTab === 'history'
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <History className="w-3 h-3" />
                      <span>History</span>
                      {displayedHistoryPlans.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-black/30 rounded-full font-black text-amber-300">
                          {displayedHistoryPlans.length}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* ── TAB 1: ACTIVE STAKING POSITIONS ── */}
                {stakingViewTab === 'active' && (
                  <>
                    {displayedActivePlans.length > 0 ? (
                      <div className="space-y-3">
                        {displayedActivePlans.map((plan, idx) => (
                          <div
                            key={plan.id}
                            className="bg-[#0e1628] border border-blue-900/40 rounded-2xl p-3.5 space-y-2.5"
                          >
                            {/* Row 1: Plan number, Amount, Period / ROI */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-blue-700/80 flex items-center justify-center text-xs font-black text-white shrink-0 shadow-md shadow-blue-700/30">
                                  {idx + 1}
                                </div>
                                <div>
                                  <div className="text-sm font-black text-white flex items-center gap-1.5">
                                    <img
                                      src={plan.type === 'ADS' ? '/ads-logo.png' : '/usdt-logo.png'}
                                      alt="Icon"
                                      className="w-4 h-4 rounded-full object-cover"
                                    />
                                    {plan.type === 'ADS' ? (
                                      <>
                                        <span>{plan.adsAmount.toLocaleString()} ADS</span>
                                        <span className="text-[10px] text-slate-400 font-normal">
                                          (≈ ${plan.usdtAmount.toFixed(0)})
                                        </span>
                                      </>
                                    ) : (
                                      <span>${plan.usdtAmount.toFixed(2)} USDT</span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    Stake Date: <span className="text-slate-200 font-semibold">{plan.stakeDate}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                                  {plan.dailyRoiText}
                                </span>
                                <div className="text-[9px] text-slate-400 mt-0.5">{plan.periodLabel}</div>
                              </div>
                            </div>

                            {/* Row 2: Max Capping & Earning Till Date (per user requirement) */}
                            <div className="grid grid-cols-2 gap-2 bg-[#090e18] border border-slate-800/80 rounded-xl p-2.5 text-xs">
                              <div>
                                <span className="text-[9px] text-slate-400 block font-semibold">Max Capping</span>
                                <span className="text-[11px] font-bold text-amber-300">{plan.maxCapping}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] text-slate-400 block font-semibold">Earning Till Date</span>
                                <span className="text-[11px] font-black text-emerald-400">{plan.earningTillDate}</span>
                              </div>
                            </div>

                            {/* Row 3: Action Bar (Unstake for ADS, Locked Capital for USDT) */}
                            <div className="flex items-center justify-between pt-1">
                              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-500" />
                                <span>Maturity / End: <strong className="text-blue-300">{plan.endDate}</strong></span>
                              </div>

                              {plan.type === 'ADS' && plan.isFlexible ? (
                                <button
                                  disabled={isProcessing}
                                  onClick={() => handleUnstakeAds(plan.stakeId)}
                                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-black flex items-center gap-1.5 transition-all shadow-md shadow-rose-600/20 active:scale-95 disabled:opacity-40"
                                  title="Unstake flexible ADS staking plan"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                  Unstake
                                </button>
                              ) : (
                                <div className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg font-bold">
                                  <Lock className="w-3 h-3 text-amber-400" />
                                  <span>Locked Capital (No Unstake)</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Link to History if items exist */}
                        {displayedHistoryPlans.length > 0 && (
                          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                            <span className="text-[11px] text-slate-400">
                              Past positions: <strong className="text-slate-200">{displayedHistoryPlans.length} in History</strong>
                            </span>
                            <button
                              onClick={() => setStakingViewTab('history')}
                              className="text-xs font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-all"
                            >
                              <History className="w-3.5 h-3.5" />
                              View Staking History →
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Empty state for Active */
                      <div className="text-center py-8">
                        {walletAddress ? (
                          <>
                            <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-3">
                              <Layers className="w-6 h-6 text-slate-600" />
                            </div>
                            <div className="text-slate-400 text-xs font-semibold">
                              {dashboardMode === 'ads' ? 'No active ADS staking plans' : 'No active USDT staking positions'}
                            </div>
                            <div className="text-slate-500 text-[10px] mt-0.5">
                              {dashboardMode === 'ads'
                                ? 'Your on-chain ADS stakes will appear here'
                                : 'Your on-chain USDT deposits will appear here'}
                            </div>
                            {displayedHistoryPlans.length > 0 && (
                              <button
                                onClick={() => setStakingViewTab('history')}
                                className="mt-3 text-xs text-purple-400 hover:text-purple-300 font-bold flex items-center justify-center gap-1.5 mx-auto py-1.5 px-3 rounded-xl bg-purple-600/10 border border-purple-500/20 transition-all"
                              >
                                <History className="w-3.5 h-3.5" />
                                View {displayedHistoryPlans.length} Completed / Unstaked Position{displayedHistoryPlans.length > 1 ? 's' : ''} in History →
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-3">
                              <Wallet className="w-6 h-6 text-slate-600" />
                            </div>
                            <div className="text-slate-400 text-xs font-semibold">
                              Connect wallet to view your {dashboardMode === 'ads' ? 'ADS' : 'USDT'} plans
                            </div>
                          </>
                        )}
                        <button
                          onClick={() => {
                            setStakeMode(dashboardMode);
                            setActiveTab('stake');
                          }}
                          className="mt-3 px-4 py-1.5 rounded-full bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-bold transition-all"
                        >
                          + Start {dashboardMode === 'ads' ? 'ADS' : 'USDT'} Staking
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* ── TAB 2: STAKING HISTORY (COMPLETED OR UNSTAKED) ── */}
                {stakingViewTab === 'history' && (
                  <>
                    {displayedHistoryPlans.length > 0 ? (
                      <div className="space-y-3">
                        {displayedHistoryPlans.map((plan, idx) => (
                          <div
                            key={plan.id}
                            className="bg-[#0b101c] border border-slate-800 rounded-2xl p-3.5 space-y-2.5 opacity-90 hover:opacity-100 transition-all"
                          >
                            {/* Row 1: Number, Amount, Status Badge */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                                  {idx + 1}
                                </div>
                                <div>
                                  <div className="text-sm font-black text-white flex items-center gap-1.5">
                                    <img
                                      src={plan.type === 'ADS' ? '/ads-logo.png' : '/usdt-logo.png'}
                                      alt="Icon"
                                      className="w-4 h-4 rounded-full object-cover"
                                    />
                                    {plan.type === 'ADS' ? (
                                      <>
                                        <span>{plan.adsAmount.toLocaleString()} ADS</span>
                                        <span className="text-[10px] text-slate-400 font-normal">
                                          (≈ ${plan.usdtAmount.toFixed(0)})
                                        </span>
                                      </>
                                    ) : (
                                      <span>${plan.usdtAmount.toFixed(2)} USDT</span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    Stake Date: <span className="text-slate-300 font-semibold">{plan.stakeDate}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Status Badge */}
                              <div className="text-right">
                                {plan.status === 'UNSTAKED' ? (
                                  <span className="text-[10px] font-bold text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                    <Unlock className="w-3 h-3" />
                                    Unstaked
                                  </span>
                                ) : plan.status === 'PERIOD_OVER' ? (
                                  <span className="text-[10px] font-bold text-blue-300 bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3 text-blue-400" />
                                    Period Ended
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                                    Cap Reached
                                  </span>
                                )}
                                <div className="text-[9px] text-slate-500 mt-0.5">{plan.periodLabel}</div>
                              </div>
                            </div>

                            {/* Row 2: Max Capping & Total Rewards */}
                            <div className="grid grid-cols-2 gap-2 bg-[#080d16] border border-slate-800/80 rounded-xl p-2.5 text-xs">
                              <div>
                                <span className="text-[9px] text-slate-500 block font-semibold">Max Capping</span>
                                <span className="text-[11px] font-medium text-slate-300">{plan.maxCapping}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] text-slate-500 block font-semibold">Total Rewards Earned</span>
                                <span className="text-[11px] font-black text-emerald-400">{plan.earningTillDate}</span>
                              </div>
                            </div>

                            {/* Row 3: End / Completion Info */}
                            <div className="flex items-center justify-between pt-0.5 text-[10px] text-slate-400">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-500" />
                                <span>End / Status: <strong className="text-slate-300">{plan.completedDate || plan.endDate}</strong></span>
                              </div>
                              <div className="text-slate-400 font-semibold">
                                {plan.status === 'UNSTAKED'
                                  ? 'Principal returned to wallet'
                                  : 'Rewards fully earned • Plan closed'}
                              </div>
                            </div>
                          </div>
                        ))}

                        <div className="pt-2 text-center">
                          <button
                            onClick={() => setStakingViewTab('active')}
                            className="text-xs font-bold text-slate-400 hover:text-white transition-all inline-flex items-center gap-1"
                          >
                            ← Back to Active Plans
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Empty state for History */
                      <div className="text-center py-8">
                        <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-3">
                          <History className="w-6 h-6 text-slate-600" />
                        </div>
                        <div className="text-slate-400 text-xs font-semibold">
                          No {dashboardMode === 'ads' ? 'ADS' : 'USDT'} staking history yet
                        </div>
                        <div className="text-slate-500 text-[10px] mt-0.5 max-w-[240px] mx-auto">
                          Positions that complete their time period or are unstaked will automatically be saved here
                        </div>
                        <button
                          onClick={() => setStakingViewTab('active')}
                          className="mt-3 px-4 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold transition-all"
                        >
                          ← Back to Active Plans
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: STAKE FLOW (Whitepaper v2.0 Page 6 & 7)                    */}
          {/* ================================================================= */}
          {activeTab === 'stake' && (
            <div className="space-y-4 animate-in fade-in duration-200">

              {/* Module Toggle */}
              <div className="p-1 rounded-xl bg-slate-900 border border-slate-800 flex gap-1">
                <button
                  onClick={() => setStakeMode('ads')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    stakeMode === 'ads'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <img src="/ads-logo.png" alt="ADS" className="w-4 h-4 rounded-full object-cover" />
                  ADS Module Staking
                </button>
                <button
                  onClick={() => setStakeMode('usdt')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    stakeMode === 'usdt'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <img src="/usdt-logo.png" alt="USDT" className="w-4 h-4 rounded-full object-cover" />
                  USDT Module (1% Daily)
                </button>
              </div>

              {/* ADS MODULE STAKING */}
              {stakeMode === 'ads' && (
                <div className="space-y-4">

                  {/* Header Title */}
                  <div className="bg-gradient-to-r from-blue-900/40 to-slate-900 border border-blue-500/30 p-3 rounded-2xl flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                        <img src="/ads-logo.png" alt="ADS" className="w-4 h-4 rounded-full object-cover" />
                        ADS MODULE STAKING
                      </h2>
                      <span className="text-[10px] text-slate-400">Fixed Supply • DEX Discovery • Daily Rewards</span>
                    </div>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 font-bold px-2 py-0.5 rounded-full border border-blue-500/40">
                      Step by Step
                    </span>
                  </div>

                  {/* STEP 5: Enter Stake Amount */}
                  <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-[10px] font-black flex items-center justify-center text-white">5</span>
                        Enter Stake Amount (USDT)
                      </label>
                      <span className="text-[11px] text-slate-400">
                        Balance: <strong className="text-amber-400">${walletUsdtBalance} USDT</strong>
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        value={stakeUsdtInput}
                        onChange={(e) => setStakeUsdtInput(e.target.value)}
                        placeholder="1000"
                        className="w-full bg-[#0e141f] border border-slate-700 rounded-xl px-4 py-3 text-lg font-bold text-white focus:outline-none focus:border-blue-500 transition-all pr-24"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700">
                        <img src="/usdt-logo.png" alt="USDT" className="w-3.5 h-3.5 rounded-full object-cover" />
                        <span className="text-xs font-bold text-emerald-400">USDT</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      {['100', '500', '1000', '2500'].map((amt) => (
                        <button
                          key={amt}
                          onClick={() => setStakeUsdtInput(amt)}
                          className={`py-1 text-xs font-bold rounded-lg border transition-all ${
                            stakeUsdtInput === amt
                              ? 'bg-blue-600 text-white border-blue-500'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          ${amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* STEP 6: Choose Staking Period (Accurate Reward Percentages from Page 6) */}
                  <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-pink-600 text-[10px] font-black flex items-center justify-center text-white">6</span>
                        Choose Staking Period
                      </label>
                      <span className="text-[10px] text-slate-400">Whitepaper Page 6</span>
                    </div>

                    <div className="space-y-2">
                      {[
                        { days: 0, label: 'Flexible Period', roi: '0.20% daily', desc: 'Withdraw principal anytime' },
                        { days: 30, label: '30 Days', roi: '0.40% daily', desc: '0.40% daily up to 112% Cap (Locked Capital)' },
                        { days: 90, label: '90 Days', roi: '0.60% daily', desc: '0.60% daily up to 154% Cap (Locked Capital)' },
                        { days: 180, label: '180 Days', roi: '0.80% daily', desc: '0.80% daily up to 300% Cap (Locked Capital)' },
                        { days: 360, label: '360 Days', roi: '1.00% daily', desc: 'Top yield 1.00% daily up to 460% Cap (Locked Capital)', popular: true },
                      ].map((item) => (
                        <div
                          key={item.days}
                          onClick={() => setSelectedAdsPeriod(item.days)}
                          className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            selectedAdsPeriod === item.days
                              ? 'bg-blue-600/15 border-blue-500 text-white shadow-md'
                              : 'bg-[#0e141f] border-slate-800/80 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              selectedAdsPeriod === item.days
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-slate-600'
                            }`}>
                              {selectedAdsPeriod === item.days && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold">{item.label}</span>
                                {item.popular && (
                                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-bold px-1.5 py-0.2 rounded border border-emerald-500/30">
                                    Top Yield
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] text-slate-500 block">{item.desc}</span>
                            </div>
                          </div>
                          <span className="text-xs font-black text-blue-400">{item.roi}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* STEP 7: ADS Quantity Calculation */}
                  <div className="bg-[#141b27] border border-emerald-500/30 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-[10px] font-black flex items-center justify-center text-white">7</span>
                        ADS Quantity Calculation
                      </span>
                      <span className="text-[10px] text-slate-400">1 USDT = 2 ADS ($0.50)</span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#0e141f] border border-slate-800 space-y-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xs text-slate-400">Current ADS Price:</span>
                        <div className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                          <img src="/ads-logo.png" alt="ADS" className="w-3.5 h-3.5 rounded-full object-cover" />
                          <span className="text-xs font-black text-amber-300">$0.50</span>
                        </div>
                      </div>

                      <div className="flex justify-center text-slate-500">
                        <ArrowDown className="w-4 h-4 animate-bounce text-blue-400" />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block">You Will Receive (Approx.)</span>
                        <div className="text-2xl font-black text-emerald-400 flex items-center justify-center gap-1.5">
                          <img src="/ads-logo.png" alt="ADS" className="w-6 h-6 rounded-full object-cover" />
                          {calculatedAdsQuantity.toLocaleString()} ADS
                        </div>
                        <span className="text-[10px] text-slate-500 block mt-0.5">Based on market price ($1 USDT = 2 ADS at $0.50)</span>
                      </div>

                      {/* Reward Breakdown Box */}
                      <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 gap-2 text-left">
                        <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-[9px] text-slate-400 block font-semibold">Daily Reward Rate</span>
                          <span className="text-xs font-black text-blue-400">
                            {serverCalculationAds ? `${serverCalculationAds.dailyRoiPercentage.toFixed(2)}% Daily` : `${selectedPlanRoiPercent.toFixed(2)}% Daily`}
                          </span>
                          <span className="text-[9px] text-slate-500 block mt-0.5">{selectedAdsPeriod === 0 ? 'Flexible Term' : `${selectedAdsPeriod} Days Term`}</span>
                        </div>
                        <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-[9px] text-slate-400 block font-semibold">Estimated Daily Reward</span>
                          <span className="text-xs font-black text-emerald-400">
                            {serverCalculationAds ? `${serverCalculationAds.dailyRewardTokens?.toFixed(2)} ADS` : `${adsDailyReward.toFixed(2)} ADS`}
                          </span>
                          <span className="text-[9px] text-slate-500 block mt-0.5">
                            ≈ ${serverCalculationAds ? serverCalculationAds.dailyRewardUsdt.toFixed(2) : (adsDailyReward * 0.50).toFixed(2)} USDT / day
                          </span>
                        </div>
                        <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-[9px] text-slate-400 block font-semibold">Reward in 1 Min (Testnet)</span>
                          <span className="text-xs font-black text-amber-300">{serverCalculationAds ? `${serverCalculationAds.rewardPerMinuteTestnet.toFixed(4)} ADS / min` : `${adsDailyReward.toFixed(4)} ADS / min`}</span>
                          <span className="text-[9px] text-slate-500 block mt-0.5">At 1m = 1 day test pace</span>
                        </div>
                        <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-[9px] text-slate-400 block font-semibold">{selectedAdsPeriod === 0 ? 'Principal Return' : 'Total Plan Rewards'}</span>
                          <span className="text-xs font-black text-white">
                            {selectedAdsPeriod === 0 ? 'Anytime' : `${adsTotalPeriodReward.toFixed(0)} ADS`}
                          </span>
                          <span className="text-[9px] text-slate-500 block mt-0.5">
                            {selectedAdsPeriod === 0 ? 'Principal Unlockable Anytime' : 'Locked Capital (Rewards Only)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* STEP 8: Deposit USDT & Start Staking (Locks ADS Equivalent) */}
                  <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-[10px] font-black flex items-center justify-center text-white">8</span>
                        System Buy ADS & Start Staking
                      </span>
                      <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                        <span>USDT</span>
                        <ArrowRight className="w-3 h-3" />
                        <span>ADS</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      You stake USDT directly. The vault records your deposit as equivalent ADS tokens at <strong>$0.50</strong>. All daily rewards and 100% principal return are paid in <strong>ADS tokens</strong> to your wallet. No DEX swap needed!
                    </p>

                    <button
                      disabled={isProcessing || parsedUsdtStake <= 0}
                      onClick={handleStartAdsStaking}
                      className="w-full py-4 rounded-xl font-black bg-blue-600 hover:bg-blue-500 text-white text-sm flex items-center justify-center gap-2 transition-all shadow-xl shadow-blue-600/30 disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          {processingStep || 'Processing on Blockchain...'}
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Confirm & Start Staking
                        </>
                      )}
                    </button>
                  </div>

                </div>
              )}

              {/* USDT STAKING MODULE */}
              {stakeMode === 'usdt' && (
                <div className="space-y-4">

                  {/* Header & Multiplier Cap Table */}
                  <div className="bg-gradient-to-r from-emerald-950/50 via-slate-900 to-amber-950/40 border border-emerald-500/40 p-3 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-black text-white flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-emerald-400" />
                        USDT STAKING MODULE
                      </h2>
                      <span className="text-xs font-black text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/40">
                        1.00% DAILY
                      </span>
                    </div>

                    <div className="bg-[#0e141f] rounded-xl p-2.5 border border-slate-800 text-[10px]">
                      <div className="text-amber-400 font-extrabold uppercase text-[9px] mb-1.5">Return Multiplier (Max Capping)</div>
                      <div className="grid grid-cols-3 gap-1 text-center font-semibold">
                        <div className="p-1 rounded bg-slate-900 border border-slate-800">
                          <span className="text-emerald-400 font-black block">2X</span>
                          <span className="text-slate-400 text-[9px]">$10 - $999</span>
                        </div>
                        <div className="p-1 rounded bg-slate-900 border border-slate-800">
                          <span className="text-amber-400 font-black block">2.5X</span>
                          <span className="text-slate-400 text-[9px]">$1,000 - $4,999</span>
                        </div>
                        <div className="p-1 rounded bg-slate-900 border border-slate-800">
                          <span className="text-blue-400 font-black block">3X</span>
                          <span className="text-slate-400 text-[9px]">$5,000 & above</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* STEP 5: Enter Staking Amount */}
                  <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-[10px] font-black flex items-center justify-center text-white">5</span>
                        Enter Staking Amount (USDT)
                      </label>
                      <span className="text-[11px] text-slate-400">
                        Balance: <strong className="text-amber-400">${walletUsdtBalance}</strong>
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        value={usdtDepositInput}
                        onChange={(e) => setUsdtDepositInput(e.target.value)}
                        placeholder="1000"
                        className="w-full bg-[#0e141f] border border-slate-700 rounded-xl px-4 py-3 text-lg font-bold text-white focus:outline-none focus:border-emerald-500 transition-all pr-24"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700">
                        <img src="/usdt-logo.png" alt="USDT" className="w-3.5 h-3.5 rounded-full object-cover" />
                        <span className="text-xs font-bold text-emerald-400">USDT</span>
                      </div>
                    </div>

                    {/* Applicable Plan Card */}
                    <div className="p-3 rounded-xl bg-[#0e141f] border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Applicable Plan</span>
                          <span className="text-sm font-black text-amber-400">{usdtMultiplier} ({usdtPlanRange})</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">Max Payout Cap</span>
                          <span className="text-xs font-bold text-white">${usdtMaxReturn.toLocaleString()} USDT</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[10px]">
                        <div>
                          <span className="text-slate-400 block">Daily Yield (1.00%):</span>
                          <span className="font-bold text-emerald-400">${usdtDailyReward.toFixed(2)} USDT / day</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 block">Reward in 1 Min (Testnet):</span>
                          <span className="font-bold text-amber-300">{serverCalculationUsdt ? `${serverCalculationUsdt.rewardPerMinuteTestnet.toFixed(4)} USDT / min` : `${(usdtDailyReward).toFixed(4)} USDT / min`}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* STEP 6: USDT Allocation Breakdown (80% Burn + 20% LP) */}
                  <div className="bg-[#141b27] border border-emerald-500/30 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-pink-600 text-[10px] font-black flex items-center justify-center text-white">6</span>
                        Deposit Allocation &amp; Reward Breakdown
                      </span>
                      <span className="text-[10px] text-emerald-400 font-semibold">Whitepaper Page 7</span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#0e141f] border border-slate-800 space-y-3">
                      {/* Allocation Bar */}
                      <div>
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-rose-400 font-bold">80% Buy &amp; Burn Treasury</span>
                          <span className="text-blue-400 font-bold">20% Liquidity</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden flex">
                          <div className="h-full bg-rose-500" style={{ width: '80%' }}></div>
                          <div className="h-full bg-blue-500" style={{ width: '20%' }}></div>
                        </div>
                        <div className="flex justify-between text-[10px] mt-1">
                          <span className="text-rose-300 font-mono">${serverCalculationUsdt?.buyBurnAllocationUsdt != null ? serverCalculationUsdt.buyBurnAllocationUsdt.toFixed(2) : (parsedUsdtDeposit * 0.8).toFixed(2)} USDT</span>
                          <span className="text-blue-300 font-mono">${serverCalculationUsdt?.liquidityAllocationUsdt != null ? serverCalculationUsdt.liquidityAllocationUsdt.toFixed(2) : (parsedUsdtDeposit * 0.2).toFixed(2)} USDT</span>
                        </div>
                      </div>
                      {/* Reward Section */}
                      <div className="border-t border-slate-800 pt-2 grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <span className="text-slate-400 block">Daily Reward (1%)</span>
                          <span className="font-black text-emerald-400">${(parsedUsdtDeposit * 0.01).toFixed(2)} USDT / day</span>
                          <span className="text-slate-500 block">Paid directly in USDT</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 block">Max Payout Cap</span>
                          <span className="font-black text-amber-300">{usdtMultiplier} Cap</span>
                          <span className="text-slate-500 block">${usdtMaxReturn.toLocaleString()} USDT total</span>
                        </div>
                      </div>
                    </div>

                    <button
                      disabled={isProcessing || parsedUsdtDeposit < 10}
                      onClick={handleStartUsdtStaking}
                      className="w-full py-4 rounded-xl font-black bg-blue-600 hover:bg-blue-500 text-white text-sm flex items-center justify-center gap-2 transition-all shadow-xl shadow-blue-600/30 disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          {processingStep || 'Processing USDT Stake...'}
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Stake & Earn Started
                        </>
                      )}
                    </button>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: WITHDRAWAL FLOW WITH 3% SALES TAX DEDUCTION                */}
          {/* ================================================================= */}
          {activeTab === 'withdrawal' && (
            <div className="space-y-4 animate-in fade-in duration-200">

              <div className="bg-gradient-to-r from-blue-900/40 to-slate-900 border border-blue-500/30 p-3 rounded-2xl flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    WITHDRAWAL SECTION
                  </h2>
                  <span className="text-[10px] text-slate-400">3% Base Sales Tax deducted to Treasury</span>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/40">
                  Step 10-12
                </span>
              </div>

              {/* STEP 11: Select Token & Breakdown */}
              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white block">Select Token to Withdraw</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setWithdrawToken('ADS')}
                      className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all ${
                        withdrawToken === 'ADS'
                          ? 'bg-blue-600/20 border-blue-500 text-white font-bold'
                          : 'bg-[#0e141f] border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <img src="/ads-logo.png" alt="ADS" className="w-7 h-7 rounded-full object-cover shadow-md border border-amber-500/40 shrink-0" />
                      <div className="text-left">
                        <span className="text-xs font-bold block">ADS</span>
                        <span className="text-[9px] text-slate-400">ADS Token</span>
                      </div>
                    </button>

                    <button
                      onClick={() => setWithdrawToken('USDT')}
                      className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all ${
                        withdrawToken === 'USDT'
                          ? 'bg-emerald-600/20 border-emerald-500 text-white font-bold'
                          : 'bg-[#0e141f] border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <img src="/usdt-logo.png" alt="USDT" className="w-7 h-7 rounded-full object-cover shadow-md border border-emerald-500/40 shrink-0" />
                      <div className="text-left">
                        <span className="text-xs font-bold block">USDT</span>
                        <span className="text-[9px] text-slate-400">USDT Staking Rewards</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Available Accrued Reward */}
                <div className="p-3 rounded-xl bg-[#0e141f] border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Available Reward Balance</span>
                    <span className="text-base font-black text-white">
                      {withdrawToken === 'ADS' ? `${pendingAdsRewards} ADS` : `${pendingUsdtRewards} USDT`}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    Ready to Claim
                  </span>
                </div>

                {/* 3% SALES TAX DEDUCTION BREAKDOWN (Whitepaper Page 6 & 7) */}
                <div className="p-3.5 rounded-xl bg-slate-900 border border-amber-500/30 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-amber-300 pb-1.5 border-b border-slate-800">
                    <span className="flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-amber-400" />
                      3% Sales Tax Calculation
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Treasury Policy</span>
                  </div>

                  <div className="space-y-1 text-slate-300 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Gross Withdrawal:</span>
                      <span className="font-bold text-white">
                        {activeRewardGross.toFixed(2)} {withdrawToken}
                      </span>
                    </div>

                    <div className="flex justify-between text-rose-400">
                      <span>3% Sales Tax Deducted:</span>
                      <span className="font-bold">
                        - {tax3Percent.toFixed(2)} {withdrawToken}
                      </span>
                    </div>

                    <div className="flex justify-between text-emerald-400 font-bold pt-1 border-t border-slate-800 text-xs">
                      <span>Net Credited to Wallet (97%):</span>
                      <span>
                        {netRewardAfter97.toFixed(2)} {withdrawToken}
                      </span>
                    </div>
                  </div>

                  <div className="text-[9px] text-slate-400 pt-1 leading-relaxed bg-[#0a0e16] p-2 rounded-lg border border-slate-800/80">
                    💡 <strong>Whitepaper Rule:</strong> Under the tokenomics model, a 3% base sales tax is deducted on all withdrawals and routed to the Ecosystem Treasury as protocol revenue. (Example: Withdraw 100 → receive 97 net in your wallet).
                  </div>
                </div>

                {/* Withdraw Button */}
                <button
                  disabled={isProcessing || activeRewardGross <= 0}
                  onClick={handleWithdrawal}
                  className="w-full py-3.5 rounded-xl font-black bg-blue-600 hover:bg-blue-500 text-white text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      {processingStep || 'Processing on Blockchain...'}
                    </>
                  ) : (
                    `Withdraw ${withdrawToken === "ADS" ? "ADS Rewards" : "USDT Rewards"} (Receive 97% Net)`
                  )}
                </button>
              </div>



            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 4: REFERRAL INCOME & COMMUNITY TIER REPORTS                    */}
          {/* Total L1, Total L2, Total L3 Summary                               */}
          {/* Report: L1, L2, L3 Member (wallet address, stake, date, TXN Hash)  */}
          {/* Community Tier Income: Data received from V1, V2, ... V5           */}
          {/* ================================================================= */}
          {activeTab === 'referrals' && (
            <div className="space-y-4 animate-in fade-in duration-200">

              {/* Referral Link Card — Mobile Wallet Compatible */}
              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-blue-400" />
                    Your Referral Link
                  </span>
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 font-bold px-2 py-0.5 rounded-full border border-blue-500/30">
                    3-Level System
                  </span>
                </div>

                {/* Standard URL — Desktop & most browsers */}
                <div>
                  <div className="text-[10px] text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
                    <span className="w-4 h-4 bg-emerald-500/20 text-emerald-400 rounded text-[9px] font-black flex items-center justify-center">✓</span>
                    Standard Link <span className="text-slate-500">(Desktop browsers, Chrome, Firefox)</span>
                  </div>
                  <div className="flex items-center gap-2 bg-[#0e141f] border border-slate-800 p-2.5 rounded-xl">
                    <span className="text-[11px] font-mono text-slate-300 truncate flex-1">
                      {walletAddress ? referralUrl : 'Connect wallet to see your link'}
                    </span>
                    <button
                      onClick={() => {
                        if (!isConnected) {
                          setShowWalletModal(true);
                        } else {
                          copyToClipboard(referralUrl, 'ref_std');
                        }
                      }}
                      className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all shrink-0 flex items-center gap-1 text-xs font-bold"
                    >
                      {copiedAddress === 'ref_std' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedAddress === 'ref_std' ? 'Copied!' : isConnected ? 'Copy' : 'Connect'}</span>
                    </button>
                  </div>
                </div>

                {/* Hash-based URL — MetaMask Mobile / Trust Wallet */}
                {walletAddress && (
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
                      <span className="w-4 h-4 bg-amber-500/20 text-amber-400 rounded text-[9px] font-black flex items-center justify-center">📱</span>
                      Mobile Wallet Link <span className="text-slate-500">(MetaMask Mobile, Trust Wallet)</span>
                    </div>
                    <div className="flex items-center gap-2 bg-[#0e141f] border border-amber-500/20 p-2.5 rounded-xl">
                      <span className="text-[11px] font-mono text-slate-300 truncate flex-1">
                        {referralUrlHash}
                      </span>
                      <button
                        onClick={() => copyToClipboard(referralUrlHash, 'ref_hash')}
                        className="p-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-all shrink-0 flex items-center gap-1 text-xs font-bold"
                      >
                        {copiedAddress === 'ref_hash' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedAddress === 'ref_hash' ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="bg-blue-950/40 border border-blue-500/20 p-2.5 rounded-xl text-[10px] text-blue-200 leading-relaxed">
                  <strong className="text-white">📌 How to share:</strong>
                  <ul className="mt-1 space-y-0.5 text-slate-300">
                    <li>• <strong>Desktop / Chrome / Safari:</strong> Use the Standard Link above.</li>
                    <li>• <strong>MetaMask Mobile:</strong> Copy the 📱 Mobile Wallet Link — paste inside MetaMask's built-in browser.</li>
                    <li>• <strong>Trust Wallet:</strong> Same — use the 📱 Mobile Wallet Link in the DApp browser.</li>
                    <li>• <strong>Telegram / WhatsApp:</strong> Share either link — your referral is saved automatically.</li>
                  </ul>
                </div>

                <div className="text-[10px] text-slate-500 flex items-center justify-between">
                  <span>Partners earn you: 10% L1 · 3% L2 · 2% L3 on total stake!</span>
                  <span className="text-blue-400 font-medium">Full Address Encoded</span>
                </div>
              </div>

              {/* UPLINE SPONSOR (REFERRER ID) BANNER */}
              <div className="bg-[#141b27] border border-blue-500/30 p-3 rounded-2xl flex items-center justify-between shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Your Sponsor (Upline Referrer ID)</span>
                      <span className="text-[9px] bg-blue-500/20 text-blue-300 font-bold px-1.5 py-0.2 rounded border border-blue-500/30">Upline</span>
                    </div>
                    {sponsorReferrer ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-xs font-bold text-white">
                          {sponsorReferrer.slice(0, 8)}...{sponsorReferrer.slice(-6)}
                        </span>
                        <button
                          onClick={() => copyToClipboard(sponsorReferrer, 'upline_ref')}
                          className="text-slate-400 hover:text-white"
                          title="Copy Referrer Address"
                        >
                          {copiedAddress === 'upline_ref' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                        <a
                          href={`https://testnet.bscscan.com/address/${sponsorReferrer}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-white"
                          title="View on BscScan"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic block mt-0.5">None (Direct Registration / Root Account)</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-500 block">Hierarchy Position</span>
                  <span className="text-[10px] font-semibold text-emerald-400">
                    {sponsorReferrer ? 'Upline Connected' : 'Independent Root'}
                  </span>
                </div>
              </div>

              {/* OVERVIEW STATS BANNER */}
              <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-blue-950/60 border border-emerald-500/40 p-3.5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block">Total Referral Income Earned</span>
                  <div className="text-xl font-black text-emerald-400 flex items-center gap-1">
                    <DollarSign className="w-5 h-5 -mr-1" />
                    {totalReferralIncome.toFixed(2)} USDT
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-semibold block">Total Team Network</span>
                  <span className="text-sm font-black text-white">{totalTeamMembers} Members</span>
                  <span className="text-[9px] text-slate-500 block">${totalTeamVolume.toLocaleString()} Vol</span>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* SECTION 1: Total L1    Total L2    Total L3 (Exact Format)    */}
              {/* ------------------------------------------------------------- */}
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                  Referral Income Summary
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  {/* Total L1 */}
                  <div className="bg-[#141b27] border border-emerald-500/40 p-3 rounded-2xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500"></div>
                    <span className="text-[10px] font-extrabold text-emerald-400 block uppercase">Level 1 (Direct)</span>
                    <div className="text-xl font-black text-white my-1">
                      {l1Members.length} <span className="text-xs font-normal text-emerald-300">({activeL1Count} Act)</span>
                    </div>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded inline-block">
                      10% on Stake
                    </span>
                    <div className="text-[10px] font-bold text-slate-300 mt-1.5">
                      ${l1TotalIncome.toFixed(2)}
                    </div>
                    <span className="text-[9px] text-slate-500 block">Total Earned</span>
                    <div className="mt-1.5 pt-1 border-t border-slate-800">
                      {referralEligibility.l1 ? (
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          ✓ Eligible
                        </span>
                      ) : (
                        <span className="text-[8px] font-semibold text-amber-300 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20" title="Requires $100 personal stake & $100 direct volume">
                          Req: $100+$100
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Total L2 */}
                  <div className="bg-[#141b27] border border-blue-500/40 p-3 rounded-2xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500"></div>
                    <span className="text-[10px] font-extrabold text-blue-400 block uppercase">Level 2 (Tier 2)</span>
                    <div className="text-xl font-black text-white my-1">
                      {l2Members.length} <span className="text-xs font-normal text-blue-300">({activeL2Count} Act)</span>
                    </div>
                    <span className="text-[9px] bg-blue-500/20 text-blue-300 font-bold px-1.5 py-0.5 rounded inline-block">
                      3% on Stake
                    </span>
                    <div className="text-[10px] font-bold text-slate-300 mt-1.5">
                      ${l2TotalIncome.toFixed(2)}
                    </div>
                    <span className="text-[9px] text-slate-500 block">Total Earned</span>
                    <div className="mt-1.5 pt-1 border-t border-slate-800">
                      {referralEligibility.l2 ? (
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          ✓ Eligible
                        </span>
                      ) : (
                        <span className="text-[8px] font-semibold text-amber-300 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20" title="Requires 2 active direct referrals & $500 team volume">
                          Req: 2 Act + $500
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Total L3 */}
                  <div className="bg-[#141b27] border border-amber-500/40 p-3 rounded-2xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500"></div>
                    <span className="text-[10px] font-extrabold text-amber-400 block uppercase">Level 3 (Tier 3)</span>
                    <div className="text-xl font-black text-white my-1">
                      {l3Members.length} <span className="text-xs font-normal text-amber-300">({activeL3Count} Act)</span>
                    </div>
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded inline-block">
                      2% on Stake
                    </span>
                    <div className="text-[10px] font-bold text-slate-300 mt-1.5">
                      ${l3TotalIncome.toFixed(2)}
                    </div>
                    <span className="text-[9px] text-slate-500 block">Total Earned</span>
                    <div className="mt-1.5 pt-1 border-t border-slate-800">
                      {referralEligibility.l3 ? (
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          ✓ Eligible
                        </span>
                      ) : (
                        <span className="text-[8px] font-semibold text-amber-300 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20" title="Requires 3 active direct referrals & $1,000 team volume">
                          Req: 3 Act + $1k
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SUB-SECTION TOGGLE: [ Visual Tree ] | [ Report (L1, L2, L3) ] | [ Community Tier ] */}
              <div className="p-1 rounded-xl bg-slate-900 border border-slate-800 flex gap-1">
                <button
                  onClick={() => setReferralsSubTab('tree')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    referralsSubTab === 'tree'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Network className="w-3.5 h-3.5" />
                  Visual Tree
                </button>
                <button
                  onClick={() => setReferralsSubTab('report')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    referralsSubTab === 'report'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Report (L1, L2, L3)
                </button>
                <button
                  onClick={() => setReferralsSubTab('tierIncome')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    referralsSubTab === 'tierIncome'
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Award className="w-3.5 h-3.5" />
                  Community Tier
                </button>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* SUB-TAB: VISUAL REFERRAL TREE VIEW                            */}
              {/* Root: YOU (Root Sponsor) with wallet, tier, personal stake     */}
              {/* L1 Branch: Direct Referrals (10% rate, count, cards)          */}
              {/* L2 Branch: Second-Level Referrals (3% rate, count, cards)     */}
              {/* L3 Branch: Third-Level Referrals (2% rate, count, cards)     */}
              {/* ------------------------------------------------------------- */}
              {referralsSubTab === 'tree' && (
                <div className="space-y-4">
                  {/* Explanatory Note */}
                  <div className="bg-blue-950/40 border border-blue-500/30 p-3 rounded-2xl text-[11px] text-blue-200 leading-relaxed flex items-start gap-2.5 shadow-lg">
                    <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block text-white text-xs mb-0.5">Referral Tree Architecture</span>
                      Hierarchy is calculated relative to <strong>YOU</strong>. L1 = 10%, L2 = 3%, L3 = 2% of downline total staked amount. Your Referrer ID is in your upline, not in this downline tree.
                    </div>
                  </div>

                  {/* TREE ROOT NODE: YOU (Root Sponsor) */}
                  <div className="bg-gradient-to-br from-[#162238] to-[#0f1726] border-2 border-blue-500/60 rounded-2xl p-4 shadow-xl relative text-center">
                    <div className="inline-block bg-blue-600 text-white text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-md tracking-wider mb-2">
                      YOU (Root Sponsor)
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-11 h-11 rounded-full bg-blue-500/20 border border-blue-400/50 flex items-center justify-center text-blue-400 font-bold mb-2 shadow-inner">
                        <Wallet className="w-5 h-5" />
                      </div>
                      <div className="font-mono text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Wallet Not Connected'}</span>
                        {walletAddress && (
                          <button
                            onClick={() => copyToClipboard(walletAddress, 'root_tree_wallet')}
                            className="text-slate-400 hover:text-white"
                            title="Copy Wallet Address"
                          >
                            {copiedAddress === 'root_tree_wallet' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        )}
                        {walletAddress && (
                          <a
                            href={`https://testnet.bscscan.com/address/${walletAddress}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-400 hover:text-white"
                            title="View on BscScan"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-2.5 flex-wrap justify-center">
                        <span className="text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                          Community Tier: {userCommunityTier} ({userTierBonusPercentage}%)
                        </span>
                        <span className="text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          Personal Stake: ${personalStakingAmount.toLocaleString()} USDT
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-2">
                        Total Network: <strong className="text-white">{totalTeamMembers} Members</strong> • <strong className="text-emerald-400">${totalTeamVolume.toLocaleString()} Vol</strong>
                      </div>
                    </div>
                  </div>

                  {/* BRANCH CONNECTOR */}
                  <div className="flex flex-col items-center justify-center -my-1">
                    <div className="w-0.5 h-4 bg-blue-500/50"></div>
                    <ArrowDown className="w-3.5 h-3.5 text-blue-400 -my-0.5" />
                  </div>

                  {/* LEVEL 1 BRANCH: Direct Referrals */}
                  <div className="bg-[#141b27] border border-emerald-500/40 rounded-2xl p-3.5 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-black flex items-center justify-center border border-emerald-500/30">
                          L1
                        </span>
                        <div>
                          <div className="text-xs font-black text-white flex items-center gap-1.5">
                            Level 1 Branch (Direct Referrals)
                          </div>
                          <span className="text-[10px] text-emerald-400 font-bold">10% Direct Staking Commission</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-slate-300 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full">
                        {l1Members.length} Members (${l1TotalVolume.toLocaleString()} Vol)
                      </span>
                    </div>

                    {l1Members.length === 0 ? (
                      <div className="text-center py-6 px-3 bg-[#0e141f] rounded-xl border border-slate-800/80 space-y-1">
                        <Users className="w-5 h-5 text-slate-500 mx-auto" />
                        <div className="text-xs font-bold text-slate-300">No Level 1 Referrals Yet</div>
                        <p className="text-[10px] text-slate-500">Share your referral link above. Direct sign-ups earn you 10% on their total staked amount!</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {l1Members.map((m, idx) => (
                          <div key={m.id} className="bg-[#0e141f] border border-emerald-500/20 rounded-xl p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-bold text-slate-200">
                                #{idx + 1} {m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${m.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                                {m.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-400">Stake: <strong className="text-white">${m.stakeAmount.toLocaleString()}</strong></span>
                              <span className="text-emerald-400 font-bold">+10% Commission</span>
                            </div>
                            <div className="flex items-center justify-between text-[9px] text-slate-500 pt-1 border-t border-slate-800/60">
                              <span className="flex items-center gap-1">
                                <img src={m.stakeToken === 'ADS' ? '/ads-logo.png' : '/usdt-logo.png'} alt={m.stakeToken} className="w-3 h-3 rounded-full object-cover" />
                                <span>{m.stakeAmountRaw} {m.stakeToken}</span>
                              </span>
                              <span className="text-emerald-300 font-semibold">+${m.commissionEarned.toFixed(2)} Earned</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* BRANCH CONNECTOR */}
                  <div className="flex flex-col items-center justify-center -my-1">
                    <div className="w-0.5 h-4 bg-blue-500/50"></div>
                    <ArrowDown className="w-3.5 h-3.5 text-blue-400 -my-0.5" />
                  </div>

                  {/* LEVEL 2 BRANCH: Second-Level Referrals */}
                  <div className="bg-[#141b27] border border-blue-500/40 rounded-2xl p-3.5 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-black flex items-center justify-center border border-blue-500/30">
                          L2
                        </span>
                        <div>
                          <div className="text-xs font-black text-white flex items-center gap-1.5">
                            Level 2 Branch (Second-Level Referrals)
                          </div>
                          <span className="text-[10px] text-blue-400 font-bold">3% Level 2 Staking Commission</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-slate-300 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full">
                        {l2Members.length} Members (${l2TotalVolume.toLocaleString()} Vol)
                      </span>
                    </div>

                    {l2Members.length === 0 ? (
                      <div className="text-center py-6 px-3 bg-[#0e141f] rounded-xl border border-slate-800/80 space-y-1">
                        <Users className="w-5 h-5 text-slate-500 mx-auto" />
                        <div className="text-xs font-bold text-slate-300">No Level 2 Referrals Yet</div>
                        <p className="text-[10px] text-slate-500">Level 2 partners are invited by your Level 1 direct team. Earn 3% on their total staked amount!</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {l2Members.map((m, idx) => (
                          <div key={m.id} className="bg-[#0e141f] border border-blue-500/20 rounded-xl p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-bold text-slate-200">
                                #{idx + 1} {m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${m.isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                                {m.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-400">Stake: <strong className="text-white">${m.stakeAmount.toLocaleString()}</strong></span>
                              <span className="text-blue-400 font-bold">+3% Commission</span>
                            </div>
                            <div className="flex items-center justify-between text-[9px] text-slate-500 pt-1 border-t border-slate-800/60">
                              <span className="flex items-center gap-1">
                                <img src={m.stakeToken === 'ADS' ? '/ads-logo.png' : '/usdt-logo.png'} alt={m.stakeToken} className="w-3 h-3 rounded-full object-cover" />
                                <span>{m.stakeAmountRaw} {m.stakeToken}</span>
                              </span>
                              <span className="text-blue-300 font-semibold">+${m.commissionEarned.toFixed(2)} Earned</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* BRANCH CONNECTOR */}
                  <div className="flex flex-col items-center justify-center -my-1">
                    <div className="w-0.5 h-4 bg-amber-500/50"></div>
                    <ArrowDown className="w-3.5 h-3.5 text-amber-400 -my-0.5" />
                  </div>

                  {/* LEVEL 3 BRANCH: Third-Level Referrals */}
                  <div className="bg-[#141b27] border border-amber-500/40 rounded-2xl p-3.5 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center border border-amber-500/30">
                          L3
                        </span>
                        <div>
                          <div className="text-xs font-black text-white flex items-center gap-1.5">
                            Level 3 Branch (Third-Level Referrals)
                          </div>
                          <span className="text-[10px] text-amber-400 font-bold">2% Level 3 Staking Commission</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-slate-300 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full">
                        {l3Members.length} Members (${l3TotalVolume.toLocaleString()} Vol)
                      </span>
                    </div>

                    {l3Members.length === 0 ? (
                      <div className="text-center py-6 px-3 bg-[#0e141f] rounded-xl border border-slate-800/80 space-y-1">
                        <Users className="w-5 h-5 text-slate-500 mx-auto" />
                        <div className="text-xs font-bold text-slate-300">No Level 3 Referrals Yet</div>
                        <p className="text-[10px] text-slate-500">Level 3 partners are invited by your Level 2 team. Earn 2% on their total staked amount!</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {l3Members.map((m, idx) => (
                          <div key={m.id} className="bg-[#0e141f] border border-amber-500/20 rounded-xl p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-bold text-slate-200">
                                #{idx + 1} {m.walletAddress.slice(0, 6)}...{m.walletAddress.slice(-4)}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${m.isActive ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'}`}>
                                {m.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-400">Stake: <strong className="text-white">${m.stakeAmount.toLocaleString()}</strong></span>
                              <span className="text-amber-400 font-bold">+2% Commission</span>
                            </div>
                            <div className="flex items-center justify-between text-[9px] text-slate-500 pt-1 border-t border-slate-800/60">
                              <span className="flex items-center gap-1">
                                <img src={m.stakeToken === 'ADS' ? '/ads-logo.png' : '/usdt-logo.png'} alt={m.stakeToken} className="w-3 h-3 rounded-full object-cover" />
                                <span>{m.stakeAmountRaw} {m.stakeToken}</span>
                              </span>
                              <span className="text-amber-300 font-semibold">+${m.commissionEarned.toFixed(2)} Earned</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* SUB-TAB A: DOWNLINE MEMBERS REPORT (L1, L2, L3)               */}
              {/* Exact format:                                                 */}
              {/* Report                                                        */}
              {/* L1 Member                                                     */}
              {/* wallet address | stake amount | Date | TXN Hash               */}
              {/* Same for L2 and L3                                            */}
              {/* ------------------------------------------------------------- */}
              {referralsSubTab === 'report' && (
                <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black uppercase text-white flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-emerald-400" />
                        Report
                      </h3>
                      <span className="text-[10px] text-slate-400">
                        {selectedReportLevel === 1 ? 'L1 Member' : selectedReportLevel === 2 ? 'L2 Member' : 'L3 Member'} Details
                      </span>
                    </div>

                    {/* Level Selector Buttons */}
                    <div className="flex gap-1 bg-[#0e141f] p-1 rounded-xl border border-slate-800">
                      {[1, 2, 3].map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setSelectedReportLevel(lvl as 1 | 2 | 3)}
                          className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all ${
                            selectedReportLevel === lvl
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          L{lvl} Member ({lvl === 1 ? l1Members.length : lvl === 2 ? l2Members.length : l3Members.length})
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Level Header Banner */}
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-slate-200 font-bold">
                      {selectedReportLevel === 1 ? 'L1 Member (Direct Referral)' : selectedReportLevel === 2 ? 'L2 Member (Second Level)' : 'L3 Member (Third Level)'}
                    </span>
                    <span className="text-emerald-400 font-bold">
                      {selectedReportLevel === 1 ? '10% on Total Stake' : selectedReportLevel === 2 ? '3% on Total Stake' : '2% on Total Stake'}
                    </span>
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search wallet address or TXN Hash..."
                      value={reportSearchQuery}
                      onChange={(e) => setReportSearchQuery(e.target.value)}
                      className="w-full bg-[#0e141f] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 transition-all"
                    />
                  </div>

                  {/* Table Column Header Label */}
                  <div className="hidden sm:grid grid-cols-4 gap-2 text-[10px] font-bold text-slate-400 uppercase px-2 py-1 bg-slate-900/80 rounded-lg">
                    <span>Wallet Address</span>
                    <span className="text-right">Stake Amount</span>
                    <span className="text-center">Date</span>
                    <span className="text-right">TXN Hash</span>
                  </div>

                  {/* Members List */}
                  {displayedReportMembers.length === 0 ? (
                    <div className="text-center py-10 px-4 bg-[#0e141f] rounded-2xl border border-slate-800/80 space-y-2.5">
                      <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
                        <Users className="w-5 h-5" />
                      </div>
                      <div className="text-xs font-bold text-white">No Level {selectedReportLevel} Members Yet</div>
                      <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                        {selectedReportLevel === 1
                          ? 'Share your referral link above. When partners join via your link and stake, their address, stake amount, date, and your 10% commission will appear here automatically!'
                          : selectedReportLevel === 2
                          ? 'Level 2 members join through your direct partners. You earn 3% commission on their total staked amount.'
                          : 'Level 3 members join through your Level 2 network. You earn 2% commission on their total staked amount.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {displayedReportMembers.map((member, index) => (
                        <div
                          key={member.id}
                          className="bg-[#0e141f] border border-slate-800/80 hover:border-slate-700 rounded-xl p-3 space-y-2 transition-all shadow-sm"
                        >
                          {/* Row 1: Wallet Address & Stake Amount */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-md bg-blue-500/20 text-blue-400 text-[10px] font-black flex items-center justify-center">
                                #{index + 1}
                              </span>
                              <div className="flex items-center gap-1 font-mono text-xs font-bold text-slate-200">
                                <span>{member.walletAddress.slice(0, 6)}...{member.walletAddress.slice(-4)}</span>
                                <button
                                  onClick={() => copyToClipboard(member.walletAddress, `w_${member.id}`)}
                                  className="text-slate-500 hover:text-blue-400 transition-colors"
                                  title="Copy Wallet Address"
                                >
                                  {copiedAddress === `w_${member.id}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                                <a
                                  href={`https://testnet.bscscan.com/address/${member.walletAddress}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-slate-500 hover:text-white"
                                  title="View on BscScan"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>

                            {/* Stake Amount */}
                            <div className="text-right">
                              <span className="text-xs font-black text-amber-400">
                                ${member.stakeAmount.toLocaleString()} USDT
                              </span>
                              <span className="text-[9px] text-slate-500 block">
                                {member.stakeAmountRaw} {member.stakeToken}
                              </span>
                            </div>
                          </div>

                          {/* Row 2: Date & TXN Hash */}
                          <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-900/60 p-2 rounded-lg border border-slate-800/50">
                            <div>
                              <span className="text-slate-500 block flex items-center gap-1">
                                <Calendar className="w-2.5 h-2.5" /> Date:
                              </span>
                              <span className="font-mono text-slate-300 font-semibold">{member.date}</span>
                            </div>

                            <div>
                              <span className="text-slate-500 block flex items-center gap-1">
                                <Hash className="w-2.5 h-2.5" /> TXN Hash:
                              </span>
                              <div className="flex items-center gap-1 font-mono text-blue-400">
                                <a
                                  href={`https://testnet.bscscan.com/tx/${member.txnHash}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline truncate hover:text-white"
                                >
                                  {member.txnHash.slice(0, 8)}...{member.txnHash.slice(-6)}
                                </a>
                                <button
                                  onClick={() => copyToClipboard(member.txnHash, `tx_${member.id}`)}
                                  className="text-slate-500 hover:text-white shrink-0"
                                  title="Copy Txn Hash"
                                >
                                  {copiedAddress === `tx_${member.id}` ? (
                                    <Check className="w-2.5 h-2.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-2.5 h-2.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Row 3: Total Stake & Commission */}
                          <div className="flex items-center justify-between text-[10px] pt-0.5">
                            <span className="text-slate-500">
                              Total Staked: <strong className="text-slate-300">${member.stakeAmount.toLocaleString()} USDT</strong>
                            </span>
                            <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20" title="Commission earned on downline's total stake">
                              Commission: +${member.commissionEarned.toFixed(2)} ({member.level === 1 ? '10' : member.level === 2 ? '3' : '2'}% of Stake)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}


                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* SUB-TAB B: COMMUNITY TIER INCOME (V1 to V6 Differential)      */}
              {/* Data of Income received from V1 or V2 ....or V5               */}
              {/* ------------------------------------------------------------- */}
              {referralsSubTab === 'tierIncome' && (
                <div className="space-y-4">

                  {/* Status Banner */}
                  <div className="bg-[#141b27] border border-amber-500/30 rounded-2xl p-4 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-black text-sm">
                          {userCommunityTier}
                        </div>
                        <div>
                          <div className="text-xs font-black text-white">Your Community Tier: {userCommunityTier}</div>
                          <span className="text-[10px] text-amber-400 font-bold">{userTierBonusPercentage}% Differential Rate</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                        Total Tier Earned: +{totalTierIncomeReceived.toLocaleString()} ADS
                      </span>
                    </div>

                    {/* Dual Qualification Status */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#0e141f] p-3 rounded-xl border border-slate-800">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Personal Staking:</span>
                        <span className="font-bold text-white">${personalStakingAmount.toLocaleString()} USDT</span>
                        <span className="text-[9px] text-slate-500 block mt-0.5">Authoritative Personal Volume</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Total Team Staking Volume:</span>
                        <span className="font-bold text-white">${totalTeamStakingVolume.toLocaleString()} USDT</span>
                        <span className="text-[9px] text-slate-500 block mt-0.5">Total Downline Network</span>
                      </div>
                    </div>

                    {/* Next Tier Progress */}
                    {nextTierName && (
                      <div className="bg-[#0e141f] p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-slate-300">Next Target: <strong className="text-amber-400">{nextTierName} ({nextTierRate}%)</strong></span>
                          <span className="text-[10px] text-slate-400">
                            Dual Requirement: Personal & Team Volume
                          </span>
                        </div>
                        <div className="space-y-1.5 text-[10px]">
                          <div>
                            <div className="flex justify-between text-slate-400 mb-0.5">
                              <span>Personal Stake: ${personalStakingAmount.toLocaleString()} / Need ${nextPersonalRequired.toLocaleString()} more</span>
                              <span>{personalProgressPct}%</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${personalProgressPct}%` }}></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-slate-400 mb-0.5">
                              <span>Team Volume: ${totalTeamStakingVolume.toLocaleString()} / Need ${nextTeamVolumeRequired.toLocaleString()} more</span>
                              <span>{teamProgressPct}%</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-amber-500 h-full rounded-full transition-all" style={{ width: `${teamProgressPct}%` }}></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400 leading-relaxed bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      💡 <strong>Differential Bonus Formula:</strong><br />
                      <code className="text-amber-300">Differential Bonus = Eligible Team Volume × (Your Tier Rate - Downline's Tier Rate)</code>
                    </div>
                  </div>

                  {/* SUMMARY: DATA OF INCOME RECEIVED FROM V1, V2, ... V6 */}
                  <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                    <span className="text-xs font-black uppercase text-white flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-amber-400" />
                      Community Tier Qualification & Rates (V1 to V6)
                    </span>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { tier: 'V1', pct: '10%', req: '100U Pers. + 5,000U Team' },
                        { tier: 'V2', pct: '20%', req: '500U Pers. + 20,000U Team' },
                        { tier: 'V3', pct: '30%', req: '1,000U Pers. + 50,000U Team' },
                        { tier: 'V4', pct: '35%', req: '3,000U Pers. + 150,000U Team' },
                        { tier: 'V5', pct: '45%', req: '5,000U Pers. + 500,000U Team' },
                        { tier: 'V6', pct: '55%', req: '10,000U Pers. + 2,000,000U Team' },
                      ].map((item) => {
                        const rec = tierIncomeByTier[item.tier];
                        const isCurrent = userCommunityTier === item.tier;
                        return (
                          <div
                            key={item.tier}
                            className={`border rounded-xl p-2.5 space-y-1 transition-all ${
                              isCurrent
                                ? 'bg-amber-500/10 border-amber-500/50 shadow-md shadow-amber-500/10'
                                : 'bg-[#0e141f] border-slate-800/80'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center ${
                                isCurrent ? 'bg-amber-500 text-black' : 'bg-amber-500/20 text-amber-300'
                              }`}>
                                {item.tier}
                              </span>
                              <span className="text-[10px] font-bold text-amber-400">{item.pct}</span>
                            </div>
                            <div className="text-[10px] text-slate-300 font-medium">
                              {item.req}
                            </div>
                            <div className="flex items-center justify-between text-[9px] text-slate-400 pt-1 border-t border-slate-800/60">
                              <span>Earned: {rec ? `${rec.total.toLocaleString()} ADS` : '0 ADS'}</span>
                              <span>{rec ? `${rec.count} Txns` : '0 Txns'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* DETAILED TIER INCOME LOGS */}
                  <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                    <span className="text-xs font-black uppercase text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Differential Bonus Transaction History
                    </span>

                    <div className="space-y-2">
                      {tierIncomeRecords.length === 0 ? (
                        <div className="text-center py-8 px-4 bg-[#0e141f] rounded-xl border border-slate-800 space-y-1.5">
                          <span className="text-xs font-semibold text-slate-400 block">No Differential Bonus Transactions Yet</span>
                          <span className="text-[10px] text-slate-500 block">Differential overrides credit automatically when downline volume qualifies for Community Tiers (V1 to V6).</span>
                        </div>
                      ) : (
                        tierIncomeRecords.map((t) => (
                        <div key={t.id} className="bg-[#0e141f] border border-slate-800 rounded-xl p-3 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/30">
                                {t.downlineTier} Downline
                              </span>
                              <span className="font-mono text-[11px] text-slate-300">
                                {t.downlineAddress.slice(0, 6)}...{t.downlineAddress.slice(-4)}
                              </span>
                            </div>
                            <span className="text-xs font-black text-emerald-400">
                              +{t.incomeReceived.toLocaleString()} {t.token}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                            <span>
                              Override: <strong className="text-amber-300">{t.differentialRate}%</strong> ({t.userTier} vs {t.downlineTier})
                            </span>
                            <span>Vol: {t.eligibleVolume.toLocaleString()}</span>
                          </div>

                          <div className="flex items-center justify-between text-[9px] text-slate-500">
                            <span>{t.date}</span>
                            <a
                              href={`https://testnet.bscscan.com/tx/${t.txnHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-400 hover:text-white underline font-mono"
                            >
                              Txn: {t.txnHash.slice(0, 8)}... ↗
                            </a>
                          </div>
                        </div>
                      )))}
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 5: TEST TOOLS & SETTINGS                                      */}
          {/* ================================================================= */}
          {activeTab === 'tools' && (
            <div className="space-y-4 animate-in fade-in duration-200">

              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Droplets className="w-4 h-4 text-blue-400" />
                  Free Testnet Faucet
                </span>
                <p className="text-[11px] text-slate-400">
                  Mint free test USDT to test deposits without needing real crypto.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={isProcessing}
                    onClick={() => handleMintFaucetUSDT('1000')}
                    className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-md"
                  >
                    +1,000 Free USDT
                  </button>
                  <button
                    disabled={isProcessing}
                    onClick={() => handleMintFaucetUSDT('5000')}
                    className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-all"
                  >
                    +5,000 Free USDT
                  </button>
                </div>
              </div>

              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <PlusCircle className="w-4 h-4 text-emerald-400" />
                  Add Custom Tokens to MetaMask
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleImportTokenToMetaMask('ADS')}
                    className="py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 font-bold text-xs transition-all"
                  >
                    + Add ADS Token
                  </button>
                  <button
                    onClick={() => handleImportTokenToMetaMask('USDT')}
                    className="py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 font-bold text-xs transition-all"
                  >
                    + Add USDT Token
                  </button>
                </div>
              </div>



              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ExternalLink className="w-4 h-4 text-slate-400" />
                  Smart Contracts on BSC Testnet
                </span>
                <div className="space-y-1.5 text-[11px] font-mono">
                  <a
                    href={`https://testnet.bscscan.com/address/${deployedAddresses.adsToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl bg-[#0e141f] border border-slate-800 flex items-center justify-between text-slate-300 hover:text-white"
                  >
                    <span>ADS Token</span>
                    <span className="text-blue-400">0x4827...360 ↗</span>
                  </a>
                  <a
                    href={`https://testnet.bscscan.com/address/${deployedAddresses.stakingVault}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl bg-[#0e141f] border border-slate-800 flex items-center justify-between text-slate-300 hover:text-white"
                  >
                    <span>Staking Vault (1m = 1d)</span>
                    <span className="text-blue-400">0x494f...133 ↗</span>
                  </a>
                </div>
              </div>

            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 6: ADS ↔ USDT SWAP                                            */}
          {/* ================================================================= */}
          {activeTab === 'swap' && (
            <div className="space-y-4 animate-in fade-in duration-200">

              {/* Header */}
              <div className="bg-gradient-to-br from-[#141b27] to-[#0e1420] border border-slate-800 rounded-2xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
                      <ArrowDown className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-white">ADS ↔ USDT Swap</div>
                      <div className="text-[10px] text-slate-400">On-chain DEX · BSC Testnet</div>
                    </div>
                  </div>
                  <button
                    onClick={loadSwapLiquidity}
                    className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] flex items-center gap-1 border border-slate-700 transition-all"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    Refresh
                  </button>
                </div>

                {/* Rate Badge */}
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] bg-violet-500/15 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full font-bold">
                    1 USDT = 2 ADS ($0.50/ADS)
                  </span>
                  <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                    No Sell Tax
                  </span>
                  {isSwapPaused && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold animate-pulse">
                      ⚠ Swap Paused
                    </span>
                  )}
                </div>
              </div>

              {/* Liquidity Pool Card */}
              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4">
                <div className="text-[11px] font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                  Swap Contract Liquidity
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <img src="/ads-logo.png" alt="ADS" className="w-3.5 h-3.5 rounded-full object-cover" />
                      <span className="text-[10px] text-slate-400 font-semibold">ADS Reserve</span>
                    </div>
                    <div className="text-base font-black text-emerald-400">{parseFloat(swapContractLiquidity.ads).toLocaleString()}</div>
                    <span className="text-[9px] text-slate-500 block mt-0.5">≈ ${(parseFloat(swapContractLiquidity.ads) * 0.50).toFixed(2)} USDT</span>
                  </div>
                  <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <img src="/usdt-logo.png" alt="USDT" className="w-3.5 h-3.5 rounded-full object-cover" />
                      <span className="text-[10px] text-slate-400 font-semibold">USDT Reserve</span>
                    </div>
                    <div className="text-base font-black text-amber-400">{parseFloat(swapContractLiquidity.usdt).toLocaleString()}</div>
                    <span className="text-[9px] text-slate-500 block mt-0.5">Backing liquidity</span>
                  </div>
                </div>
              </div>

              {/* Swap Direction Selector */}
              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-violet-400" />
                  Swap Tokens
                </div>

                {/* Direction Toggle */}
                <div className="p-1 rounded-xl bg-slate-900 border border-slate-800 flex gap-1">
                  {/* ADS → USDT — shown FIRST */}
                  <button
                    onClick={() => { if (swapDirection !== 'ADS_TO_USDT') handleFlipSwapDirection(); }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      swapDirection === 'ADS_TO_USDT'
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <img src="/ads-logo.png" alt="ADS" className="w-3.5 h-3.5 rounded-full object-cover" />
                    ADS → USDT
                  </button>
                  {/* USDT → ADS — shown SECOND */}
                  <button
                    onClick={() => { if (swapDirection !== 'USDT_TO_ADS') handleFlipSwapDirection(); }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      swapDirection === 'USDT_TO_ADS'
                        ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <img src="/usdt-logo.png" alt="USDT" className="w-3.5 h-3.5 rounded-full object-cover" />
                    USDT → ADS
                  </button>
                </div>

                {/* Input Panel: You Pay */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>You Pay</span>
                    <span>
                      Balance:{' '}
                      <strong className={swapDirection === 'USDT_TO_ADS' ? 'text-amber-400' : 'text-emerald-400'}>
                        {swapDirection === 'USDT_TO_ADS' ? `$${walletUsdtBalance} USDT` : `${walletAdsBalance} ADS`}
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-[#0e141f] border border-slate-700 rounded-xl px-3 py-2.5 focus-within:border-violet-500/60 transition-colors">
                    <div className={`flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold ${
                      swapDirection === 'USDT_TO_ADS'
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-emerald-500/15 text-emerald-300'
                    }`}>
                      <img
                        src={swapDirection === 'USDT_TO_ADS' ? '/usdt-logo.png' : '/ads-logo.png'}
                        alt="Token"
                        className="w-4 h-4 rounded-full object-cover"
                      />
                      <span>{swapDirection === 'USDT_TO_ADS' ? 'USDT' : 'ADS'}</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={swapInputAmount}
                      onChange={(e) => handleSwapInputChange(e.target.value)}
                      placeholder={swapDirection === 'USDT_TO_ADS' ? 'Enter USDT amount' : 'Enter ADS amount'}
                      className="flex-1 bg-transparent text-sm font-bold text-white placeholder-slate-600 outline-none"
                    />
                    {/* Quick-fill MAX */}
                    <button
                      onClick={() =>
                        handleSwapInputChange(
                          swapDirection === 'USDT_TO_ADS' ? walletUsdtBalance : walletAdsBalance
                        )
                      }
                      className="text-[9px] font-black text-violet-400 hover:text-violet-300 bg-violet-500/10 border border-violet-500/30 px-1.5 py-0.5 rounded transition-all"
                    >
                      MAX
                    </button>
                  </div>
                </div>

                {/* Flip Arrow */}
                <div className="flex justify-center">
                  <button
                    onClick={handleFlipSwapDirection}
                    className="w-8 h-8 rounded-full bg-slate-800 hover:bg-violet-600/30 border border-slate-700 hover:border-violet-500/50 flex items-center justify-center transition-all group"
                  >
                    <ArrowDown className="w-4 h-4 text-slate-400 group-hover:text-violet-400 transition-colors" />
                  </button>
                </div>

                {/* Output Panel: You Receive */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>You Receive</span>
                    <span className="text-[10px] font-bold text-slate-400">{swapRate}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-[#0e141f] border border-slate-800 rounded-xl px-3 py-2.5">
                    <div className={`flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold ${
                      swapDirection === 'USDT_TO_ADS'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-amber-500/15 text-amber-300'
                    }`}>
                      <img
                        src={swapDirection === 'USDT_TO_ADS' ? '/ads-logo.png' : '/usdt-logo.png'}
                        alt="Token"
                        className="w-4 h-4 rounded-full object-cover"
                      />
                      <span>{swapDirection === 'USDT_TO_ADS' ? 'ADS' : 'USDT'}</span>
                    </div>
                    <div className="flex-1 text-sm font-bold text-white">
                      {swapEstimatedOutput ? (
                        <span className="text-emerald-400">{swapEstimatedOutput}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </div>
                    {swapEstimatedOutput && (
                      <span className="text-[9px] text-emerald-400 font-bold">
                        ≈ ${swapDirection === 'USDT_TO_ADS'
                          ? (parseFloat(swapEstimatedOutput) * 0.50).toFixed(2)
                          : parseFloat(swapEstimatedOutput).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Swap Details Breakdown */}
                {swapEstimatedOutput && (
                  <div className="bg-[#0a1020] border border-slate-800/60 rounded-xl p-3 space-y-1.5 text-[11px]">
                    <div className="flex justify-between text-slate-400">
                      <span>Exchange Rate</span>
                      <span className="font-bold text-slate-200">{swapRate}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Slippage Tolerance</span>
                      <span className="font-bold text-slate-200">{swapSlippage}%</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Min. Received</span>
                      <span className="font-bold text-emerald-400">
                        {(parseFloat(swapEstimatedOutput) * (1 - swapSlippage / 100)).toFixed(4)}{' '}
                        {swapDirection === 'USDT_TO_ADS' ? 'ADS' : 'USDT'}
                      </span>
                    </div>
                    {swapDirection === 'ADS_TO_USDT' && parseFloat(swapTaxAmount) > 0 && (
                      <div className="flex justify-between text-rose-400">
                        <span>3% Sell Tax (→ Treasury)</span>
                        <span className="font-bold">−{swapTaxAmount} USDT</span>
                      </div>
                    )}
                    <div className="border-t border-slate-800 pt-1.5 flex justify-between font-bold">
                      <span className="text-slate-300">You Receive (Net)</span>
                      <span className="text-emerald-400">
                        {swapEstimatedOutput} {swapDirection === 'USDT_TO_ADS' ? 'ADS' : 'USDT'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Slippage Control */}
                <div>
                  <div className="text-[10px] text-slate-400 font-semibold mb-1.5 flex items-center gap-1">
                    <Percent className="w-3 h-3" />
                    Slippage Tolerance
                  </div>
                  <div className="flex gap-2">
                    {[0.1, 0.5, 1.0, 2.0].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setSwapSlippage(pct)}
                        className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                          swapSlippage === pct
                            ? 'bg-violet-600 text-white border-violet-500'
                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* CTA Button */}
                {isSwapPaused ? (
                  <div className="py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold text-center">
                    ⚠ Swap is temporarily paused by admin
                  </div>
                ) : (
                  <button
                    disabled={isProcessing || !swapInputAmount || parseFloat(swapInputAmount) <= 0}
                    onClick={swapDirection === 'USDT_TO_ADS' ? handleSwapUSDTForADS : handleSwapADSForUSDT}
                    className={`w-full py-3.5 rounded-xl font-black text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
                      swapDirection === 'USDT_TO_ADS'
                        ? 'bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white shadow-violet-600/30 disabled:opacity-40'
                        : 'bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white shadow-rose-600/30 disabled:opacity-40'
                    }`}
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        {processingStep || 'Processing…'}
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        {swapDirection === 'USDT_TO_ADS'
                          ? `Swap USDT → ADS`
                          : `Sell ADS → USDT`}
                      </>
                    )}
                  </button>
                )}

                {/* Connect Wallet Prompt */}
                {!isConnected && (
                  <button
                    onClick={() => setShowWalletModal(true)}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-xs transition-all flex items-center justify-center gap-2"
                  >
                    <Wallet className="w-3.5 h-3.5 text-blue-400" />
                    Connect Wallet to Swap
                  </button>
                )}
              </div>

              {/* Safety & Info Panel */}
              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Swap Information
                </div>
                <div className="space-y-2 text-[11px] text-slate-400">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                    <span><strong className="text-slate-200">USDT → ADS:</strong> No sell tax. You receive exactly 2× ADS per USDT at the fixed $0.50 price.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                    <span><strong className="text-slate-200">ADS → USDT:</strong> No sell tax. You receive exactly 0.5 USDT per ADS at the fixed $0.50 price.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Shield className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
                    <span><strong className="text-slate-200">Reentrancy Protected:</strong> The smart contract uses OpenZeppelin ReentrancyGuard for safe transfers.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Percent className="w-3 h-3 text-violet-400 mt-0.5 shrink-0" />
                    <span><strong className="text-slate-200">Slippage Protection:</strong> Your transaction will revert if the output falls below your selected minimum.</span>
                  </div>
                </div>
              </div>

              {/* Swap Contract Address */}
              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5 text-slate-500" />
                  Smart Contract
                </div>
                <a
                  href={`https://testnet.bscscan.com/address/${deployedAddresses.adsSwap}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#0e141f] border border-slate-800 text-[11px] font-mono hover:border-violet-500/40 transition-all group"
                >
                  <span className="text-slate-400 group-hover:text-white transition-colors">ADS Swap Contract</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-violet-400 font-bold">
                      {deployedAddresses.adsSwap.slice(0, 8)}...{deployedAddresses.adsSwap.slice(-4)} ↗
                    </span>
                  </div>
                </a>
              </div>

            </div>
          )}

        </main>

        {/* ================================================================= */}
        {/* FIXED BOTTOM NAVIGATION BAR                                       */}
        {/* ================================================================= */}
        <nav className="fixed bottom-0 z-40 w-full max-w-md bg-[#0c1018]/95 backdrop-blur-md border-t border-slate-800/80 px-1 py-2 flex items-center justify-around shadow-2xl">
          {[
            { id: 'dashboard', label: 'Home', icon: Layers, color: 'text-blue-400' },
            { id: 'stake', label: 'Stake', icon: Coins, color: 'text-blue-400' },
            { id: 'swap', label: 'Swap', icon: ArrowRight, color: 'text-violet-400' },
            { id: 'withdrawal', label: 'Withdraw', icon: TrendingUp, color: 'text-blue-400' },
            { id: 'referrals', label: 'Referrals', icon: Users, color: 'text-blue-400' },
            { id: 'tools', label: 'Tools', icon: Settings, color: 'text-blue-400' },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all ${
                  active
                    ? `${tab.color} font-bold scale-105`
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? tab.color : 'text-slate-500'}`} />
                <span className="text-[9px]">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* CONNECT WALLET MODAL */}
        {showWalletModal && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
            <div className="w-full max-w-xs bg-[#141b27] border border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-blue-400" />
                  Connect Wallet
                </h3>
                <button
                  onClick={() => setShowWalletModal(false)}
                  className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                {/* MetaMask */}
                <button
                  onClick={() => handleConnectWallet('MetaMask')}
                  className="w-full p-3 rounded-2xl bg-[#0e141f] border border-slate-800 hover:border-amber-500/50 flex items-center justify-between transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" viewBox="0 0 32 32">
                        <path fill="#E2761B" stroke="#E2761B" strokeLinejoin="round" strokeLinecap="round" d="m29.56 16.5-2.02-6.52-5.71-3.69-5.83 3.6-5.83-3.6-5.71 3.69L2.44 16.5l3.96 5.56 5.48-1.55 4.12 4.12 4.12-4.12 5.48 1.55 3.96-5.56z"/>
                        <path fill="#E4761B" stroke="#E4761B" strokeLinejoin="round" strokeLinecap="round" d="m2.44 16.5 7.96 1.7-1.12-5.35-6.84 3.65z"/>
                        <path fill="#CD6116" stroke="#CD6116" strokeLinejoin="round" strokeLinecap="round" d="m21.6 6.29 5.94 3.69-1.9 6.52-7.96-1.7 3.92-8.51zm-11.2 0L6.48 9.98l1.9 6.52 7.96-1.7-3.94-8.51z"/>
                        <path fill="#763D16" stroke="#763D16" strokeLinejoin="round" strokeLinecap="round" d="m11.88 20.51-4.12 4.12 4.97.77.85-4.89h-1.7zm8.24 0 .85 4.89 4.97-.77-4.12-4.12h-1.7z"/>
                        <path fill="#F6851B" stroke="#F6851B" strokeLinejoin="round" strokeLinecap="round" d="m16 24.63-4.12-4.12h8.24L16 24.63z"/>
                      </svg>
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-bold text-white block group-hover:text-amber-400 transition-colors">MetaMask</span>
                      <span className="text-[10px] text-slate-500">Recommended Web3 Wallet</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-amber-400" />
                </button>

                {/* Trust Wallet */}
                <button
                  onClick={() => handleConnectWallet('Trust Wallet')}
                  className="w-full p-3 rounded-2xl bg-[#0e141f] border border-slate-800 hover:border-blue-500/50 flex items-center justify-between transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none">
                        <path d="M16 3L6 7.5V15C6 22 10.5 27.5 16 29C21.5 27.5 26 22 26 15V7.5L16 3Z" fill="#0500FF"/>
                        <path d="M16 5.2L8 8.8V15C8 20.8 11.6 25.5 16 26.8C20.4 25.5 24 20.8 24 15V8.8L16 5.2Z" fill="#3375BB"/>
                        <path d="M13.5 15.5L11.5 13.5L10 15L13.5 18.5L22 10L20.5 8.5L13.5 15.5Z" fill="white"/>
                      </svg>
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-bold text-white block group-hover:text-blue-400 transition-colors">Trust Wallet</span>
                      <span className="text-[10px] text-slate-500">Mobile Multi-chain</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400" />
                </button>

                {/* WalletConnect */}
                <button
                  onClick={() => handleConnectWallet('WalletConnect')}
                  className="w-full p-3 rounded-2xl bg-[#0e141f] border border-slate-800 hover:border-cyan-500/50 flex items-center justify-between transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none">
                        <rect width="32" height="32" rx="8" fill="#3B99FC"/>
                        <path d="M9.5 12.5C13.1 8.9 18.9 8.9 22.5 12.5L23.2 13.2C23.5 13.5 23.5 14 23.2 14.3L21.3 16.2C21.1 16.4 20.8 16.4 20.6 16.2L19.6 15.2C17.6 13.2 14.4 13.2 12.4 15.2L11.4 16.2C11.2 16.4 10.9 16.4 10.7 16.2L8.8 14.3C8.5 14 8.5 13.5 8.8 13.2L9.5 12.5ZM26 16L27.6 17.6C27.9 17.9 27.9 18.4 27.6 18.7L20.6 25.7C20.3 26 19.8 26 19.5 25.7L16 22.2C15.9 22.1 15.7 22.1 15.6 22.2L12.1 25.7C11.8 26 11.3 26 11 25.7L4 18.7C3.7 18.4 3.7 17.9 4 17.6L5.6 16C5.9 15.7 6.4 15.7 6.7 16L10.2 19.5C10.3 19.6 10.5 19.6 10.6 19.5L14.1 16C14.4 15.7 14.9 15.7 15.2 16L18.7 19.5C18.8 19.6 19 19.6 19.1 19.5L22.6 16C22.9 15.7 23.4 15.7 23.7 16H26Z" fill="white"/>
                      </svg>
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-bold text-white block group-hover:text-cyan-400 transition-colors">WalletConnect</span>
                      <span className="text-[10px] text-slate-500">QR Code Pairing</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400" />
                </button>

                {/* Other Wallets */}
                <button
                  onClick={() => handleConnectWallet('Browser Wallet')}
                  className="w-full p-3 rounded-2xl bg-[#0e141f] border border-slate-800 hover:border-purple-500/50 flex items-center justify-between transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0">
                      <Layers className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-bold text-white block group-hover:text-purple-400 transition-colors">Other Wallets</span>
                      <span className="text-[10px] text-slate-500">Coinbase, OKX, Binance, etc.</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-purple-400" />
                </button>
              </div>
            </div>
          </div>
        )}

        </div>

    </div>
  );
}
