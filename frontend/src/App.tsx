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
  Shield
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
  intermediateSponsorAddress?: string;
  stakeAmount: number; // in USDT value
  stakeToken: 'USDT' | 'ADS';
  stakeAmountRaw: number;
  date: string;
  txnHash: string;
  dailyRewardGenerated: number;
  commissionEarned: number;
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

export default function App() {
  // Navigation: 'dashboard' | 'stake' | 'withdrawal' | 'referrals' | 'tools'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stake' | 'withdrawal' | 'referrals' | 'tools'>('dashboard');

  // Sub-modes
  const [dashboardMode, setDashboardMode] = useState<'ads' | 'usdt'>('ads');
  const [stakeMode, setStakeMode] = useState<'ads' | 'usdt'>('ads');

  // Referrals Sub-tab: 'report' | 'tierIncome'
  const [referralsSubTab, setReferralsSubTab] = useState<'report' | 'tierIncome'>('report');
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

  // ADS Staking Flow State (Module 1)
  const [stakeUsdtInput, setStakeUsdtInput] = useState<string>('1000');
  const [selectedAdsPeriod, setSelectedAdsPeriod] = useState<number>(360);

  // USDT Staking Flow State (Module 2)
  const [usdtDepositInput, setUsdtDepositInput] = useState<string>('1000');

  // Withdrawal Flow State (Steps 10, 11, 12, 13)
  const [withdrawToken, setWithdrawToken] = useState<'ADS' | 'USDT'>('ADS');
  const [withdrawRewardMode, setWithdrawRewardMode] = useState<'all' | 'daily' | 'referral'>('all');
  const [dailyStakingAdsPending, setDailyStakingAdsPending] = useState<number>(0);
  const [dailyStakingUsdtPending, setDailyStakingUsdtPending] = useState<number>(0);
  const [referralAdsPending, setReferralAdsPending] = useState<number>(0);
  const [referralUsdtPending, setReferralUsdtPending] = useState<number>(0);

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
  const [weakLegVolume, setWeakLegVolume] = useState<number>(0);
  const [strongLegVolume, setStrongLegVolume] = useState<number>(0);
  const [tierBreakdownList, setTierBreakdownList] = useState<{ tier: string; totalEarned: number; count: number }[]>([]);
  const [totalTierEarnedAmount, setTotalTierEarnedAmount] = useState<number>(0);

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
          if (dashboard.user.totalStakedAds > 0) {
            setOnChainStakedAds(dashboard.user.totalStakedAds.toFixed(2));
          }
          if (dashboard.user.totalStakedUsdt > 0) {
            setOnChainStakedUsdt(dashboard.user.totalStakedUsdt.toFixed(2));
          }
          const refAds = dashboard.user.referralPendingAds || 0;
          const refUsdt = dashboard.user.referralPendingUsdt || 0;
          const dailyAds = dashboard.user.dailyStakingPendingAds || 0;
          const dailyUsdt = dashboard.user.dailyStakingPendingUsdt || 0;
          setReferralAdsPending(refAds);
          setReferralUsdtPending(refUsdt);
          setDailyStakingAdsPending(dailyAds);
          setDailyStakingUsdtPending(dailyUsdt);
          setPendingAdsRewards((dailyAds + refAds).toFixed(4));
          setPendingUsdtRewards((dailyUsdt + refUsdt).toFixed(4));
          setActivePlansCount(dashboard.activePlansCount || 0);
          if (dashboard.user.communityTier) {
            setUserCommunityTier(dashboard.user.communityTier);
          }
        }

        if (referrals) {
          const allMembers: DownlineMember[] = [
            ...(referrals.l1Members || []).map((m: any, idx: number) => ({
              id: `l1_${idx}`,
              walletAddress: m.walletAddress,
              level: 1 as const,
              stakeAmount: m.totalStakeUsd || m.stakeAmountUsdt || 0,
              stakeToken: (m.stakeAmountAds > 0 ? 'ADS' : 'USDT') as 'ADS' | 'USDT',
              stakeAmountRaw: m.stakeAmountAds || m.stakeAmountUsdt || 0,
              date: m.date,
              txnHash: m.txnHash,
              dailyRewardGenerated: m.dailyRewardGenerated || 0,
              commissionEarned: m.commissionEarned > 0 ? m.commissionEarned : (m.dailyRewardGenerated || 0) * 0.10,
            })),
            ...(referrals.l2Members || []).map((m: any, idx: number) => ({
              id: `l2_${idx}`,
              walletAddress: m.walletAddress,
              level: 2 as const,
              intermediateSponsorAddress: m.intermediateSponsorAddress || m.sponsorAddress || '',
              stakeAmount: m.totalStakeUsd || m.stakeAmountUsdt || 0,
              stakeToken: (m.stakeAmountAds > 0 ? 'ADS' : 'USDT') as 'ADS' | 'USDT',
              stakeAmountRaw: m.stakeAmountAds || m.stakeAmountUsdt || 0,
              date: m.date,
              txnHash: m.txnHash,
              dailyRewardGenerated: m.dailyRewardGenerated || 0,
              commissionEarned: m.commissionEarned > 0 ? m.commissionEarned : (m.dailyRewardGenerated || 0) * 0.03,
            })),
            ...(referrals.l3Members || []).map((m: any, idx: number) => ({
              id: `l3_${idx}`,
              walletAddress: m.walletAddress,
              level: 3 as const,
              intermediateSponsorAddress: m.intermediateSponsorAddress || m.sponsorAddress || '',
              stakeAmount: m.totalStakeUsd || m.stakeAmountUsdt || 0,
              stakeToken: (m.stakeAmountAds > 0 ? 'ADS' : 'USDT') as 'ADS' | 'USDT',
              stakeAmountRaw: m.stakeAmountAds || m.stakeAmountUsdt || 0,
              date: m.date,
              txnHash: m.txnHash,
              dailyRewardGenerated: m.dailyRewardGenerated || 0,
              commissionEarned: m.commissionEarned > 0 ? m.commissionEarned : (m.dailyRewardGenerated || 0) * 0.02,
            })),
          ];
          setDownlineMembers(allMembers);

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
          if (tierData.weakLegVolume !== undefined) setWeakLegVolume(tierData.weakLegVolume);
          if (tierData.strongLegVolume !== undefined) setStrongLegVolume(tierData.strongLegVolume);
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

        if (rawStakedAds > 0n) {
          setOnChainStakedAds(parseFloat(formatEther(rawStakedAds)).toFixed(2));
        }
        if (rawStakedUsdt > 0n) {
          setOnChainStakedUsdt(parseFloat(formatEther(rawStakedUsdt)).toFixed(2));
        }

        const totalPlans = Number(adsStakesCount) + Number(usdtStakesCount);
        if (totalPlans > 0) {
          setActivePlansCount(totalPlans);
        }

        let totalAdsPending = 0;
        for (let i = 0; i < Number(adsStakesCount); i++) {
          const p = await vaultContract.calculatePendingAdsReward(addr, i).catch(() => 0n);
          totalAdsPending += parseFloat(formatEther(p));
        }

        let totalUsdtPending = 0;
        for (let i = 0; i < Number(usdtStakesCount); i++) {
          const p = await vaultContract.calculatePendingUsdtReward(addr, i).catch(() => 0n);
          totalUsdtPending += parseFloat(formatEther(p));
        }

        if (totalAdsPending > 0) {
          setDailyStakingAdsPending(totalAdsPending);
          setPendingAdsRewards((totalAdsPending + referralAdsPending).toFixed(4));
        }
        if (totalUsdtPending > 0) {
          setDailyStakingUsdtPending(totalUsdtPending);
          setPendingUsdtRewards((totalUsdtPending + referralUsdtPending).toFixed(4));
        }
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
  // Unified flow: Daily Staking ROI + Referral Commissions & Tier Bonuses
  // =========================================================================
  const handleWithdrawal = async () => {
    if (!isConnected) { setShowWalletModal(true); return; }
    try {
      setIsProcessing(true);
      const grossAmount = activeRewardGross;
      if (grossAmount <= 0) {
        notify('error', 'No rewards available to withdraw for the selected options.');
        return;
      }

      const taxAmount = (grossAmount * 0.03).toFixed(2);
      const netAmount = (grossAmount * 0.97).toFixed(2);

      let txHash: string | undefined;
      const hasOnChainDaily = withdrawToken === 'ADS' ? dailyStakingAdsPending > 0 : dailyStakingUsdtPending > 0;

      // 1. If user is withdrawing daily staking rewards and has on-chain pending rewards, trigger contract claim
      if (hasOnChainDaily && (withdrawRewardMode === 'all' || withdrawRewardMode === 'daily')) {
        try {
          const provider = new BrowserProvider((window as any).ethereum);
          const signer = await provider.getSigner();
          const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);

          setProcessingStep(`Withdrawing on-chain staking rewards in MetaMask...`);
          const tx = withdrawToken === 'ADS'
            ? await vaultContract.claimAdsRewards()
            : await vaultContract.claimUsdtRewards();
          await tx.wait();
          txHash = tx.hash;
        } catch (contractErr: any) {
          console.warn('On-chain claim notice (continuing with backend settlement):', contractErr);
        }
      }

      // 2. Authoritative backend settlement & referral reward deduction
      setProcessingStep(`Finalizing withdrawal & crediting 97% net...`);
      await api.recordWithdrawal({
        address: walletAddress,
        token: withdrawToken,
        amount: grossAmount,
        withdrawSource: withdrawRewardMode,
      });

      const modeTitle = withdrawRewardMode === 'all'
        ? 'All Rewards (Staking + Referral)'
        : withdrawRewardMode === 'referral'
        ? 'Referral & Tier Rewards'
        : 'Daily Staking Rewards';

      notify(
        'success',
        `✅ Withdrawn ${modeTitle}! Gross: ${grossAmount.toFixed(2)} ${withdrawToken} | 3% Sales Tax: -${taxAmount} ${withdrawToken} | Net Credited: ${netAmount} ${withdrawToken}`,
        txHash
      );

      await loadBlockchainData(walletAddress);
    } catch (err: any) {
      notify('error', err.reason || err.message || 'Withdrawal failed. Make sure you have accrued rewards.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Principal Capital Return
  const handleWithdrawPrincipal = async () => {
    if (!isConnected) { setShowWalletModal(true); return; }
    try {
      setIsProcessing(true);
      setProcessingStep('Unlocking Staked ADS Capital...');
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);

      notify('info', 'Processing Principal Return in MetaMask (100% Capital returned in ADS tokens)...');
      const tx = await vaultContract.withdrawAdsPrincipal(0);
      await tx.wait();
      notify('success', '✅ 100% Capital Returned in ADS tokens to Your Wallet!', tx.hash);
      loadBlockchainData(walletAddress);
    } catch (err: any) {
      notify('error', err.reason || err.message || 'Maturity withdrawal failed. Stake has not completed locking period yet.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Add Test Downline Stake (Processed authoritatively via Backend API)
  const handleAddTestDownline = async (level: 1 | 2 | 3) => {
    if (!walletAddress) {
      setShowWalletModal(true);
      notify('info', 'Please connect your wallet first to add test downline members.');
      return;
    }
    try {
      setIsProcessing(true);
      setProcessingStep(`Adding Demo Level ${level} Member on Backend...`);
      const targetSponsor = walletAddress;
      const stakeAmt = [500, 1000, 2500, 5000][Math.floor(Math.random() * 4)];
      await api.addTestDownline({
        sponsorAddress: targetSponsor,
        level,
        amount: stakeAmt,
        token: 'USDT',
      });
      notify('success', `Added new Level ${level} Member (${stakeAmt} USDT) via Backend API!`);
      await loadBlockchainData(targetSponsor);
    } catch (err: any) {
      notify('error', err.message || 'Failed to add test downline on backend');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Reset Team Data (Resets authoritatively in Backend DB)
  const handleResetTeamData = async () => {
    if (!walletAddress) {
      setShowWalletModal(true);
      notify('info', 'Please connect your wallet first to reset team data.');
      return;
    }
    try {
      setIsProcessing(true);
      const targetUser = walletAddress;
      await api.resetUserData(targetUser);
      localStorage.removeItem('adstoken_downlines_v2');
      localStorage.removeItem('adstoken_tier_income_v2');
      notify('info', 'Team data reset on backend. Reloading state...');
      await loadBlockchainData(targetUser);
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
  const activeRewardGross = useMemo(() => {
    if (withdrawToken === 'ADS') {
      if (withdrawRewardMode === 'daily') return dailyStakingAdsPending;
      if (withdrawRewardMode === 'referral') return referralAdsPending;
      return Number((dailyStakingAdsPending + referralAdsPending).toFixed(4));
    } else {
      if (withdrawRewardMode === 'daily') return dailyStakingUsdtPending;
      if (withdrawRewardMode === 'referral') return referralUsdtPending;
      return Number((dailyStakingUsdtPending + referralUsdtPending).toFixed(4));
    }
  }, [withdrawToken, withdrawRewardMode, dailyStakingAdsPending, referralAdsPending, dailyStakingUsdtPending, referralUsdtPending]);
  const tax3Percent = activeRewardGross * 0.03;
  const netRewardAfter97 = activeRewardGross * 0.97;

  // Referral URL Generation (FULL 42-char address, no slicing!)
  const referralUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const base = `${window.location.origin}${window.location.pathname}`;
    return walletAddress ? `${base}?ref=${walletAddress}` : '';
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

  return (
    <div className="min-h-screen bg-[#090d14] text-slate-100 flex flex-col items-center justify-start font-sans antialiased selection:bg-blue-600 selection:text-white">

      {/* MOBILE CONTAINER FRAME */}
      <div className="w-full max-w-md min-h-screen bg-[#0f141d] border-x border-slate-800/80 flex flex-col shadow-2xl relative pb-28">

        {/* TOP STATUS BAR / HEADER */}
        <header className="sticky top-0 z-40 bg-[#0f141d]/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center font-black text-white text-base shadow-lg shadow-blue-500/20">
              A
            </div>
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

              {/* Mode Selector */}
              <div className="p-1 rounded-xl bg-slate-900 border border-slate-800 flex gap-1">
                <button
                  onClick={() => setDashboardMode('ads')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    dashboardMode === 'ads'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Coins className="w-3.5 h-3.5" />
                  ADS Staking
                </button>
                <button
                  onClick={() => setDashboardMode('usdt')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    dashboardMode === 'usdt'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  USDT Staking (1% Daily)
                </button>
              </div>

              {/* DASHBOARD CARD â€” ADS STAKING */}
              {dashboardMode === 'ads' && (
                <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Staking Dashboard</span>
                    <div className="flex items-center gap-2">
                      {walletAddress && (
                        <button
                          onClick={() => loadBlockchainData(walletAddress)}
                          className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] flex items-center gap-1 border border-slate-700 transition-all"
                          title="Refresh from BSC Testnet"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          Sync
                        </button>
                      )}
                      <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">
                        {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : '0x12...ABCD'}
                      </span>
                    </div>
                  </div>

                  {/* 4 Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">My Staked</span>
                      <div className="text-lg font-black text-white">${(parseFloat(onChainStakedAds) * 0.50).toFixed(2)}</div>
                      <span className="text-[9px] text-emerald-400 block mt-0.5">{onChainStakedAds} ADS</span>
                    </div>

                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">Total Rewards</span>
                      <div className="text-lg font-black text-emerald-400">{pendingAdsRewards} ADS</div>
                      <span className="text-[9px] text-slate-500 block mt-0.5">≈ ${(parseFloat(pendingAdsRewards) * 0.50).toFixed(4)} USDT</span>
                    </div>

                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">Total Staked</span>
                      <div className="text-lg font-black text-white">{(parseFloat(onChainStakedAds) * 0.50).toFixed(0)} USDT</div>
                      <span className="text-[9px] text-slate-500 block mt-0.5">Capital in Vault</span>
                    </div>

                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">Active Plans</span>
                      <div className="text-lg font-black text-blue-400">{activePlansCount}</div>
                      <span className="text-[9px] text-blue-400/80 block mt-0.5">Earning Daily</span>
                    </div>
                  </div>

                  <button
                    onClick={() => { setStakeMode('ads'); setActiveTab('stake'); }}
                    className="w-full py-3.5 rounded-xl font-black bg-blue-600 hover:bg-blue-500 text-white text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30"
                  >
                    Start Staking
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* DASHBOARD CARD â€” USDT STAKING */}
              {dashboardMode === 'usdt' && (
                <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">USDT Staking Dashboard</span>
                    <div className="flex items-center gap-2">
                      {walletAddress && (
                        <button
                          onClick={() => loadBlockchainData(walletAddress)}
                          className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] flex items-center gap-1 border border-slate-700 transition-all"
                          title="Refresh from BSC Testnet"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          Sync
                        </button>
                      )}
                      <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                        {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : '0x12...ABCD'}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300">Daily Return Rate</span>
                    <span className="text-xs font-black text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-md">1.00% DAILY</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">My Staked</span>
                      <div className="text-lg font-black text-amber-400">${onChainStakedUsdt} USDT</div>
                      <span className="text-[9px] text-slate-500 block mt-0.5">USDT Principal</span>
                    </div>

                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">Total Rewards</span>
                      <div className="text-lg font-black text-emerald-400">${pendingUsdtRewards} USDT</div>
                      <span className="text-[9px] text-slate-500 block mt-0.5">On-Chain Pending</span>
                    </div>

                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">Daily Reward</span>
                      <div className="text-lg font-black text-white">1.00% / Day</div>
                      <span className="text-[9px] text-emerald-400 block mt-0.5">${(parseFloat(onChainStakedUsdt) * 0.01).toFixed(2)} USDT / day</span>
                    </div>

                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">Max Payout</span>
                      <div className="text-lg font-black text-amber-300">2X & 3X</div>
                      <span className="text-[9px] text-slate-500 block mt-0.5">Multiplier Cap</span>
                    </div>
                  </div>

                  <button
                    onClick={() => { setStakeMode('usdt'); setActiveTab('stake'); }}
                    className="w-full py-3.5 rounded-xl font-black bg-emerald-600 hover:bg-emerald-500 text-white text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/30"
                  >
                    Stake Now
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* QUICK REWARD CLAIM ACTION CARD WITH 3% TAX NOTICE */}
              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Pending Accrued Rewards
                  </span>
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    3% Sales Tax on Claim
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">ADS Rewards</span>
                    <span className="text-sm font-black text-white">{pendingAdsRewards} ADS</span>
                    <span className="text-[9px] text-emerald-400 block mt-0.5">Net: {(parseFloat(pendingAdsRewards) * 0.97).toFixed(2)} ADS</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">USDT Staking Rewards</span>
                    <span className="text-sm font-black text-emerald-400">${pendingUsdtRewards} USDT</span>
                    <span className="text-[9px] text-emerald-400 block mt-0.5">Net: ${(parseFloat(pendingUsdtRewards) * 0.97).toFixed(2)} USDT</span>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('withdrawal')}
                  className="w-full py-2.5 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  Go to Withdrawal Section (3% Tax Deduct)
                  <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                </button>
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
                  <Coins className="w-3.5 h-3.5" />
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
                  <Flame className="w-3.5 h-3.5" />
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
                        <Coins className="w-4 h-4 text-blue-400" />
                        ADS MODULE STAKING
                      </h2>
                      <span className="text-[10px] text-slate-400">Fixed Supply • DEX Discovery • 100% Capital Return</span>
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
                        <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[9px] font-black text-white font-mono">$</span>
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
                        { days: 30, label: '30 Days', roi: '0.40% daily', desc: '100% Capital returned at maturity' },
                        { days: 90, label: '90 Days', roi: '0.60% daily', desc: '100% Capital returned at maturity' },
                        { days: 180, label: '180 Days', roi: '0.80% daily', desc: '100% Capital returned at maturity' },
                        { days: 360, label: '360 Days', roi: '1.00% daily', desc: 'Max emission rate. Capital returned', popular: true },
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
                          <span className="w-3.5 h-3.5 rounded-full bg-amber-500 flex items-center justify-center text-[9px] font-black text-slate-950">A</span>
                          <span className="text-xs font-black text-amber-300">$0.50</span>
                        </div>
                      </div>

                      <div className="flex justify-center text-slate-500">
                        <ArrowDown className="w-4 h-4 animate-bounce text-blue-400" />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block">You Will Receive (Approx.)</span>
                        <div className="text-2xl font-black text-emerald-400 flex items-center justify-center gap-1.5">
                          <span className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-xs font-black text-slate-950">A</span>
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
                            {selectedAdsPeriod === 0 ? '100% Unlocked' : '+ 100% Capital at Maturity'}
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
                        <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[9px] font-black text-white font-mono">$</span>
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
                      className={`p-3 rounded-xl border flex items-center gap-2 transition-all ${
                        withdrawToken === 'ADS'
                          ? 'bg-blue-600/20 border-blue-500 text-white font-bold'
                          : 'bg-[#0e141f] border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-xs font-black text-slate-950">A</div>
                      <div className="text-left">
                        <span className="text-xs font-bold block">ADS</span>
                        <span className="text-[9px] text-slate-400">ADS Token</span>
                      </div>
                    </button>

                    <button
                      onClick={() => setWithdrawToken('USDT')}
                      className={`p-3 rounded-xl border flex items-center gap-2 transition-all ${
                        withdrawToken === 'USDT'
                          ? 'bg-emerald-600/20 border-emerald-500 text-white font-bold'
                          : 'bg-[#0e141f] border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-black text-white font-mono">$</div>
                      <div className="text-left">
                        <span className="text-xs font-bold block">USDT</span>
                        <span className="text-[9px] text-slate-400">USDT Staking Rewards</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Reward Source Selection (Requested: Unified Daily + Referral Rewards withdrawal) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      Select Reward Source to Withdraw
                    </label>
                    <span className="text-[10px] bg-blue-500/10 text-blue-300 font-bold px-2 py-0.5 rounded border border-blue-500/20">
                      Unified Options
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 bg-[#0e141f] p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setWithdrawRewardMode('all')}
                      className={`py-2 px-2 rounded-lg text-center transition-all ${
                        withdrawRewardMode === 'all'
                          ? 'bg-blue-600 text-white font-bold shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="text-xs block font-bold">All Rewards</span>
                      <span className="text-[9px] opacity-80 block truncate">Daily + Referral</span>
                    </button>

                    <button
                      onClick={() => setWithdrawRewardMode('daily')}
                      className={`py-2 px-2 rounded-lg text-center transition-all ${
                        withdrawRewardMode === 'daily'
                          ? 'bg-blue-600 text-white font-bold shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="text-xs block font-bold">Daily Staking</span>
                      <span className="text-[9px] opacity-80 block truncate">Staking ROI Only</span>
                    </button>

                    <button
                      onClick={() => setWithdrawRewardMode('referral')}
                      className={`py-2 px-2 rounded-lg text-center transition-all ${
                        withdrawRewardMode === 'referral'
                          ? 'bg-blue-600 text-white font-bold shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="text-xs block font-bold">Referral & Tier</span>
                      <span className="text-[9px] opacity-80 block truncate">Commissions Only</span>
                    </button>
                  </div>
                </div>

                {/* Reward Breakdown Cards */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-[#0e141f] border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block">Daily Staking ROI</span>
                    <span className="text-sm font-bold text-white font-mono">
                      {withdrawToken === 'ADS' ? `${dailyStakingAdsPending.toFixed(4)} ADS` : `$${dailyStakingUsdtPending.toFixed(4)} USDT`}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#0e141f] border border-blue-500/20 bg-blue-950/20">
                    <span className="text-[10px] text-blue-300 font-semibold flex items-center gap-1">
                      <Users className="w-2.5 h-2.5 text-blue-400" /> Referral & Tier Rewards
                    </span>
                    <span className="text-sm font-bold text-blue-200 font-mono">
                      {withdrawToken === 'ADS' ? `${referralAdsPending.toFixed(4)} ADS` : `$${referralUsdtPending.toFixed(4)} USDT`}
                    </span>
                  </div>
                </div>

                {/* Available Accrued Reward */}
                <div className="p-3 rounded-xl bg-[#0e141f] border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block">
                      {withdrawRewardMode === 'all'
                        ? 'Total Combined Available to Withdraw'
                        : withdrawRewardMode === 'daily'
                        ? 'Daily Staking Reward Available'
                        : 'Referral & Tier Reward Available'}
                    </span>
                    <span className="text-base font-black text-white">
                      {activeRewardGross.toFixed(4)} {withdrawToken}
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
                    `Withdraw ${activeRewardGross.toFixed(2)} ${withdrawToken} (${withdrawRewardMode === 'all' ? 'All Rewards' : withdrawRewardMode === 'daily' ? 'Daily ROI' : 'Referral Rewards'} - Receive 97% Net)`
                  )}
                </button>
              </div>

              {/* STEP 13: Maturity Payout / Capital Return */}
              <div className="bg-[#141b27] border border-amber-500/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                    <Unlock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">Step 13: Maturity Payout</h3>
                    <p className="text-[10px] text-slate-400">Capital Return at end of Staking Period</p>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed bg-[#0e141f] p-3 rounded-xl border border-slate-800">
                  After the selected staking period ends, the original capital amount of <strong>ADS tokens</strong> is unlocked and credited back 100% to the user.
                </p>

                <button
                  disabled={isProcessing || parseFloat(onChainStakedAds) <= 0}
                  onClick={handleWithdrawPrincipal}
                  className="w-full py-3 rounded-xl font-bold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  Withdraw Staked Principal (Capital Return)
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

              {/* Referral Link Card */}
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

                <div className="flex items-center gap-2 bg-[#0e141f] border border-slate-800 p-2.5 rounded-xl">
                  <span className="text-[11px] font-mono text-slate-300 truncate flex-1">
                    {walletAddress ? referralUrl : 'Please connect your wallet to view your referral link'}
                  </span>
                  <button
                    onClick={() => {
                      if (!isConnected) {
                        setShowWalletModal(true);
                      } else {
                        copyToClipboard(referralUrl);
                      }
                    }}
                    className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all shrink-0 flex items-center gap-1 text-xs font-bold"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : isConnected ? 'Copy' : 'Connect'}</span>
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 flex items-center justify-between">
                  <span>Share link with partners to earn 10% L1, 3% L2, 2% L3!</span>
                  <span className="text-blue-400 font-medium">Full Address Encoded</span>
                </div>
              </div>

              {/* QUICK ACTION: Unclaimed Referral Rewards & Option to Withdraw directly */}
              <div className="bg-gradient-to-r from-blue-900/40 via-[#141b27] to-indigo-950/40 border border-blue-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                    <Sparkles className="w-5 h-5 text-blue-300 animate-pulse" />
                  </div>
                  <div>
                    <span className="text-[10px] text-blue-300 font-bold uppercase tracking-wider block flex items-center gap-1">
                      Unclaimed Referral & Tier Rewards
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white font-mono">{referralAdsPending.toFixed(4)} ADS</span>
                      <span className="text-slate-500 text-xs">/</span>
                      <span className="text-sm font-black text-emerald-400 font-mono">${referralUsdtPending.toFixed(4)} USDT</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setWithdrawRewardMode('referral');
                    setActiveTab('withdrawal');
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-600/30"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Add to Withdrawal Section & Withdraw →
                </button>
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
                    <span className="text-[10px] font-extrabold text-emerald-400 block uppercase">Total L1</span>
                    <div className="text-2xl font-black text-white my-1">{l1Members.length}</div>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded inline-block">
                      10% Direct
                    </span>
                    <div className="text-[10px] font-bold text-slate-300 mt-1.5">
                      ${l1TotalIncome.toFixed(2)}
                    </div>
                    <span className="text-[9px] text-slate-500 block">Total Earned</span>
                  </div>

                  {/* Total L2 */}
                  <div className="bg-[#141b27] border border-blue-500/40 p-3 rounded-2xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500"></div>
                    <span className="text-[10px] font-extrabold text-blue-400 block uppercase">Total L2</span>
                    <div className="text-2xl font-black text-white my-1">{l2Members.length}</div>
                    <span className="text-[9px] bg-blue-500/20 text-blue-300 font-bold px-1.5 py-0.5 rounded inline-block">
                      3% Level 2
                    </span>
                    <div className="text-[10px] font-bold text-slate-300 mt-1.5">
                      ${l2TotalIncome.toFixed(2)}
                    </div>
                    <span className="text-[9px] text-slate-500 block">Total Earned</span>
                  </div>

                  {/* Total L3 */}
                  <div className="bg-[#141b27] border border-amber-500/40 p-3 rounded-2xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500"></div>
                    <span className="text-[10px] font-extrabold text-amber-400 block uppercase">Total L3</span>
                    <div className="text-2xl font-black text-white my-1">{l3Members.length}</div>
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded inline-block">
                      2% Level 3
                    </span>
                    <div className="text-[10px] font-bold text-slate-300 mt-1.5">
                      ${l3TotalIncome.toFixed(2)}
                    </div>
                    <span className="text-[9px] text-slate-500 block">Total Earned</span>
                  </div>
                </div>
              </div>

              {/* SUB-SECTION TOGGLE: [ Members Report (L1, L2, L3) ] | [ Community Tier Income ] */}
              <div className="p-1 rounded-xl bg-slate-900 border border-slate-800 flex gap-1">
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
                  Community Tier Income (V1-V5)
                </button>
              </div>

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
                      {selectedReportLevel === 1 ? '10% Daily Commission' : selectedReportLevel === 2 ? '3% Daily Commission' : '2% Daily Commission'}
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
                          ? 'Level 2 members join through your direct partners. You earn 3% daily commission on their staking activity.'
                          : 'Level 3 members join through your Level 2 network. You earn 2% daily commission on their staking activity.'}
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

                          {/* Intermediate Sponsor for L2 / L3 (Clarifies sponsor chain) */}
                          {member.intermediateSponsorAddress && (
                            <div className="text-[10px] text-slate-400 bg-slate-900/40 px-2 py-1 rounded border border-slate-800 flex items-center justify-between font-mono">
                              <span className="text-slate-500 font-sans">
                                Direct Sponsor ({member.level === 2 ? 'Your L1 Partner' : 'Your L2 Partner'}):
                              </span>
                              <span className="text-slate-300">
                                {member.intermediateSponsorAddress.slice(0, 6)}...{member.intermediateSponsorAddress.slice(-4)}
                              </span>
                            </div>
                          )}

                          {/* Row 3: Daily Reward & Commission */}
                          <div className="flex items-center justify-between text-[10px] pt-0.5">
                            <span className="text-slate-500">
                              Yield Generated: <strong className="text-slate-300">${member.dailyRewardGenerated.toFixed(2)}/day</strong>
                            </span>
                            <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20" title="Expected commission per day based on downline's staking yield">
                              Est. Daily: +${member.commissionEarned.toFixed(2)} ({member.level === 1 ? '10' : member.level === 2 ? '3' : '2'}%)
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

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#0e141f] p-3 rounded-xl border border-slate-800">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Weak-Leg Volume:</span>
                        <span className="font-bold text-white">${weakLegVolume.toLocaleString()} USDT</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">{weakLegVolume >= 5000 ? "Qualified for Tier Bonus" : "Minimum 5,000U Weak Leg required for V1"}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Strong-Leg Volume:</span>
                        <span className="font-bold text-white">${strongLegVolume.toLocaleString()} USDT</span>
                        <span className="text-[9px] text-slate-500 block mt-0.5">Primary Branch</span>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-400 leading-relaxed bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      ðŸ’¡ <strong>Formula (Whitepaper Page 10):</strong><br />
                      <code className="text-amber-300">Differential Bonus = Eligible Team Volume × (Your Tier % âˆ’ Downline's Tier %)</code>
                    </div>
                  </div>

                  {/* SUMMARY: DATA OF INCOME RECEIVED FROM V1, V2, ... V5 */}
                  <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                    <span className="text-xs font-black uppercase text-white flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-amber-400" />
                      Data of Income Received from V1 or V2 ... or V5
                    </span>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { tier: 'V1', pct: '10%', diff: '20% Override', req: '5,000U Weak' },
                        { tier: 'V2', pct: '20%', diff: '10% Override', req: '20,000U Weak' },
                        { tier: 'V3', pct: '30%', diff: '0% (Equal)', req: '50,000U Weak' },
                        { tier: 'V4', pct: '35%', diff: 'Higher Tier', req: '150,000U Weak' },
                        { tier: 'V5', pct: '45%', diff: 'Higher Tier', req: '500,000U Weak' },
                        { tier: 'V6', pct: '55%', diff: 'Higher Tier', req: '2,000,000U Weak' },
                      ].map((item) => {
                        const rec = tierIncomeByTier[item.tier];
                        return (
                          <div key={item.tier} className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-2.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="w-5 h-5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-black flex items-center justify-center">
                                {item.tier}
                              </span>
                              <span className="text-[9px] text-slate-400 font-mono">{item.diff}</span>
                            </div>
                            <div className="text-sm font-black text-white">
                              {rec ? `${rec.total.toLocaleString()} ADS` : '0 ADS'}
                            </div>
                            <div className="flex items-center justify-between text-[9px] text-slate-500">
                              <span>Tier Rate: {item.pct}</span>
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

        </main>

        {/* ================================================================= */}
        {/* FIXED BOTTOM NAVIGATION BAR                                       */}
        {/* ================================================================= */}
        <nav className="fixed bottom-0 z-40 w-full max-w-md bg-[#0c1018]/95 backdrop-blur-md border-t border-slate-800/80 px-2 py-2 flex items-center justify-around shadow-2xl">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: Layers },
            { id: 'stake', label: 'Stake', icon: Coins },
            { id: 'withdrawal', label: 'Withdrawal', icon: TrendingUp },
            { id: 'referrals', label: 'Referrals', icon: Users },
            { id: 'tools', label: 'Test Tools', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-all ${
                  active
                    ? 'text-blue-400 font-bold scale-105'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-blue-400' : 'text-slate-500'}`} />
                <span className="text-[10px]">{tab.label}</span>
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
