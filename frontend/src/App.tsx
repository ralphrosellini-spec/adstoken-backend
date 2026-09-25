import React, { useState, useEffect } from 'react';
import {
  Coins,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  Flame,
  Percent,
  Clock,
  Award,
  ExternalLink,
  Copy,
  CheckCircle,
  AlertCircle,
  BarChart3,
  PlusCircle,
  ArrowUpRight
} from 'lucide-react';
import { ethers, BrowserProvider, Contract, formatEther, parseEther } from 'ethers';
import deployedAddresses from './contracts/deployedAddresses.json';
import { ERC20_ABI, VAULT_ABI } from './contracts/abis';

const API_BASE = 'http://localhost:5000/api/staking';

export default function App() {
  const [activeTab, setActiveTab] = useState<'ads' | 'usdt' | 'dashboard' | 'referrals' | 'tiers' | 'stats'>('ads');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isTestnet, setIsTestnet] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string; txHash?: string } | null>(null);

  // Real On-Chain Balances
  const [walletAdsBalance, setWalletAdsBalance] = useState<string>('0.00');
  const [walletUsdtBalance, setWalletUsdtBalance] = useState<string>('0.00');
  const [onChainStakedAds, setOnChainStakedAds] = useState<string>('0.00');
  const [onChainStakedUsdt, setOnChainStakedUsdt] = useState<string>('0.00');
  const [isQualifiedParticipant, setIsQualifiedParticipant] = useState<boolean>(false);

  // Forms
  const [adsAmount, setAdsAmount] = useState<string>('1000');
  const [selectedAdsPeriod, setSelectedAdsPeriod] = useState<number>(360);
  const [usdtAmount, setUsdtAmount] = useState<string>('500');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Withdrawal States
  const [withdrawToken, setWithdrawToken] = useState<'ADS' | 'USDT'>('ADS');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');

  // Dashboard & Ecosystem Stats
  const [dashboardData, setDashboardData] = useState<any>({
    user: {
      address: '',
      totalStakedAds: 0,
      totalStakedUsdt: 0,
      pendingAdsRewards: 0,
      pendingUsdtRewards: 0,
      isParticipant: false,
      communityTier: 'V0',
    },
    adsStakes: [],
    usdtStakes: [],
  });

  const [ecosystemStats, setEcosystemStats] = useState<any>({
    totalAdsStaked: 10000000,
    totalUsdtStaked: 0,
    totalAdsBurned: 0,
    treasuryBalanceUsdt: 0,
    treasuryBalanceAds: 0,
    totalUsersCount: 1,
    participantUsersCount: 0,
  });

  const notify = (type: 'success' | 'error' | 'info', message: string, txHash?: string) => {
    setNotification({ type, message, txHash });
    setTimeout(() => setNotification(null), 7000);
  };

  // Check network & Load On-Chain Data
  const loadBlockchainData = async (addr: string) => {
    if (typeof (window as any).ethereum === 'undefined') return;
    try {
      const provider = new BrowserProvider((window as any).ethereum);
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);
      setIsTestnet(currentChainId === 97);

      const adsContract = new Contract(deployedAddresses.adsToken, ERC20_ABI, provider);
      const usdtContract = new Contract(deployedAddresses.usdtToken, ERC20_ABI, provider);
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, provider);

      // Read Balances
      const adsBal = await adsContract.balanceOf(addr);
      const usdtBal = await usdtContract.balanceOf(addr);
      const stakedAds = await vaultContract.userStakedADS(addr);
      const stakedUsdt = await vaultContract.userTotalStakedUsdt(addr);
      const participant = await vaultContract.isParticipant(addr);

      setWalletAdsBalance(parseFloat(formatEther(adsBal)).toLocaleString(undefined, { maximumFractionDigits: 2 }));
      setWalletUsdtBalance(parseFloat(formatEther(usdtBal)).toLocaleString(undefined, { maximumFractionDigits: 2 }));
      setOnChainStakedAds(parseFloat(formatEther(stakedAds)).toLocaleString(undefined, { maximumFractionDigits: 2 }));
      setOnChainStakedUsdt(parseFloat(formatEther(stakedUsdt)).toLocaleString(undefined, { maximumFractionDigits: 2 }));
      setIsQualifiedParticipant(participant);
    } catch (err) {
      console.error('Failed reading contract data:', err);
    }
  };

  // Switch to BSC Testnet (Chain ID 97)
  const handleSwitchToTestnet = async () => {
    if (typeof (window as any).ethereum === 'undefined') return;
    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x61' }], // 97 in hex
      });
      setIsTestnet(true);
      if (walletAddress) loadBlockchainData(walletAddress);
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x61',
                chainName: 'BNB Smart Chain Testnet',
                nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
                rpcUrls: ['https://bsc-testnet.publicnode.com'],
                blockExplorerUrls: ['https://testnet.bscscan.com'],
              },
            ],
          });
          setIsTestnet(true);
        } catch (addError) {
          notify('error', 'Failed adding BSC Testnet to MetaMask');
        }
      }
    }
  };

  // 1-Click Import Token into MetaMask
  const handleImportTokenToMetaMask = async (type: 'ADS' | 'USDT') => {
    if (typeof (window as any).ethereum === 'undefined') {
      notify('error', 'MetaMask not detected');
      return;
    }
    const tokenAddress = type === 'ADS' ? deployedAddresses.adsToken : deployedAddresses.usdtToken;
    const symbol = type === 'ADS' ? 'ADS' : 'USDT';
    try {
      const wasAdded = await (window as any).ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: tokenAddress,
            symbol: symbol,
            decimals: 18,
          },
        },
      });
      if (wasAdded) {
        notify('success', `${symbol} token imported into your MetaMask!`);
      }
    } catch (error: any) {
      notify('error', error.message || 'Failed to import token');
    }
  };

  // Connect Wallet
  const handleConnectWallet = async () => {
    if (typeof (window as any).ethereum !== 'undefined') {
      try {
        const provider = new BrowserProvider((window as any).ethereum);
        const accounts = await provider.send('eth_requestAccounts', []);
        if (accounts.length > 0) {
          const userAddr = accounts[0];
          setWalletAddress(userAddr);
          setIsConnected(true);
          notify('success', `Connected: ${userAddr.slice(0, 6)}...${userAddr.slice(-4)}`);
          loadBlockchainData(userAddr);
          fetchUserData(userAddr);
          return;
        }
      } catch (err: any) {
        notify('error', err.message || 'Wallet connection rejected');
      }
    }
  };

  const fetchUserData = async (addr: string) => {
    try {
      const res = await fetch(`${API_BASE}/user/${addr}/dashboard`);
      const json = await res.json();
      if (json.success && json.data) {
        setDashboardData(json.data);
      }
    } catch (err) {
      // Backend optional
    }
  };

  // Real On-Chain Stake ADS
  const handleOnChainStakeAds = async () => {
    const amt = parseFloat(adsAmount);
    if (!amt || amt <= 0) {
      notify('error', 'Please enter a valid ADS amount');
      return;
    }
    if (typeof (window as any).ethereum === 'undefined') {
      notify('error', 'Please connect MetaMask');
      return;
    }

    try {
      setIsProcessing(true);
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const adsContract = new Contract(deployedAddresses.adsToken, ERC20_ABI, signer);
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);

      const parsedAmount = parseEther(adsAmount);

      // 1. Approve
      notify('info', 'Step 1/2: Please approve ADS in MetaMask...');
      const approveTx = await adsContract.approve(deployedAddresses.stakingVault, parsedAmount);
      await approveTx.wait();

      // 2. Stake
      notify('info', 'Step 2/2: Confirming Staking Transaction in MetaMask...');
      const stakeTx = await vaultContract.stakeADS(parsedAmount, selectedAdsPeriod);
      await stakeTx.wait();

      notify('success', `Successfully staked ${adsAmount} ADS on-chain!`, stakeTx.hash);
      loadBlockchainData(walletAddress);
      fetchUserData(walletAddress);
    } catch (err: any) {
      console.error(err);
      notify('error', err.reason || err.message || 'Staking failed on-chain');
    } finally {
      setIsProcessing(false);
    }
  };

  // Real On-Chain Stake USDT
  const handleOnChainStakeUsdt = async () => {
    const amt = parseFloat(usdtAmount);
    if (!amt || amt < 10) {
      notify('error', 'Minimum deposit is 10 USDT');
      return;
    }
    if (typeof (window as any).ethereum === 'undefined') {
      notify('error', 'Please connect MetaMask');
      return;
    }

    try {
      setIsProcessing(true);
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const usdtContract = new Contract(deployedAddresses.usdtToken, ERC20_ABI, signer);
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);

      const parsedAmount = parseEther(usdtAmount);

      notify('info', 'Step 1/2: Please approve USDT in MetaMask...');
      const approveTx = await usdtContract.approve(deployedAddresses.stakingVault, parsedAmount);
      await approveTx.wait();

      notify('info', 'Step 2/2: Confirming USDT Stake (80% Burn / 20% LP)...');
      const stakeTx = await vaultContract.stakeUSDT(parsedAmount);
      await stakeTx.wait();

      notify('success', `Successfully staked ${usdtAmount} USDT on-chain!`, stakeTx.hash);
      loadBlockchainData(walletAddress);
      fetchUserData(walletAddress);
    } catch (err: any) {
      console.error(err);
      notify('error', err.reason || err.message || 'USDT Staking failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Real On-Chain Claim ADS Rewards (with 3% tax routed to Treasury)
  const handleClaimAdsRewards = async () => {
    try {
      setIsProcessing(true);
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);

      notify('info', 'Confirming Claim ADS Rewards in MetaMask...');
      const tx = await vaultContract.claimAdsRewards();
      await tx.wait();

      notify('success', 'ADS Rewards claimed! (3% Tax sent to Treasury)', tx.hash);
      loadBlockchainData(walletAddress);
      fetchUserData(walletAddress);
    } catch (err: any) {
      notify('error', err.reason || err.message || 'Claim failed or no pending rewards');
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate daily rewards preview for ADS
  const getSelectedAdsDailyRoi = () => {
    switch (selectedAdsPeriod) {
      case 0: return 0.20;
      case 30: return 0.40;
      case 90: return 0.60;
      case 180: return 0.80;
      case 360: return 1.00;
      default: return 0.20;
    }
  };

  const adsDailyRate = getSelectedAdsDailyRoi();
  const calculatedDailyAds = ((parseFloat(adsAmount) || 0) * adsDailyRate) / 100;
  const calculatedTotalAds = selectedAdsPeriod === 0 ? 'Variable' : (calculatedDailyAds * selectedAdsPeriod).toFixed(2);

  // USDT Multiplier calculation
  const parsedUsdt = parseFloat(usdtAmount) || 0;
  let usdtCapMultiplier = 2.0;
  if (parsedUsdt >= 5000) usdtCapMultiplier = 3.0;
  else if (parsedUsdt >= 1000) usdtCapMultiplier = 2.5;

  const referralUrl = `https://staking.adsvilla.com?ref=${walletAddress || deployedAddresses.deployer}`;

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

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0e11] text-slate-100">
      {/* Toast Notification with BscScan link */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-4 rounded-xl shadow-2xl flex flex-col gap-1 text-sm font-semibold transition-all transform animate-bounce ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' :
          notification.type === 'error' ? 'bg-rose-600 text-white' : 'bg-blue-600 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <span>{notification.message}</span>
          </div>
          {notification.txHash && (
            <a
              href={`https://testnet.bscscan.com/tx/${notification.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-emerald-200 underline flex items-center gap-1 mt-1 pl-7 hover:text-white"
            >
              <span>View on BscScan</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-slate-800 bg-[#12161c]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Coins className="w-6 h-6 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight text-white">ADSTOKEN</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  v2.0 BSC Testnet
                </span>
              </div>
              <p className="text-xs text-slate-400">Powered by Adsvilla Ecosystem</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick 1-Click Import Tokens to MetaMask */}
            <div className="hidden lg:flex items-center gap-2">
              <button
                onClick={() => handleImportTokenToMetaMask('ADS')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all"
                title="Add ADS Token to your MetaMask"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Add ADS to MetaMask
              </button>
              <button
                onClick={() => handleImportTokenToMetaMask('USDT')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all"
                title="Add Mock USDT to your MetaMask"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Add USDT to MetaMask
              </button>
            </div>

            {/* Network Badge & Switcher */}
            {isTestnet ? (
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                BSC Testnet (97)
              </div>
            ) : (
              <button
                onClick={handleSwitchToTestnet}
                className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-300 hover:bg-amber-500/30"
              >
                Switch to BSC Testnet
              </button>
            )}

            {/* Wallet Connect Button */}
            <button
              onClick={handleConnectWallet}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-md ${
                isConnected
                  ? 'bg-slate-800 border border-emerald-500/40 text-emerald-400 hover:bg-slate-750'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
              }`}
            >
              <Wallet className="w-4 h-4" />
              {isConnected
                ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                : 'Connect Wallet'}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto gap-2 py-2 border-t border-slate-800/60 scrollbar-none">
          {[
            { id: 'ads', label: 'ADS Staking (Module 1)', icon: Coins },
            { id: 'usdt', label: 'USDT Entry (Module 2)', icon: Flame },
            { id: 'dashboard', label: 'Dashboard & Withdrawals', icon: TrendingUp },
            { id: 'referrals', label: '3-Level Referrals', icon: Users },
            { id: 'tiers', label: 'Community Tiers (V1-V6)', icon: Award },
            { id: 'stats', label: 'Ecosystem & Contracts', icon: BarChart3 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* On-Chain Wallet Balances Bar */}
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-[#121820] to-[#151c24] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[11px] text-slate-400 font-semibold block">Your On-Chain ADS:</span>
              <span className="text-base font-extrabold text-white">{walletAdsBalance} ADS</span>
            </div>
            <div className="h-8 w-px bg-slate-800"></div>
            <div>
              <span className="text-[11px] text-slate-400 font-semibold block">Your On-Chain USDT:</span>
              <span className="text-base font-extrabold text-amber-400">${walletUsdtBalance} USDT</span>
            </div>
            <div className="h-8 w-px bg-slate-800"></div>
            <div>
              <span className="text-[11px] text-slate-400 font-semibold block">Currently Staked ADS:</span>
              <span className="text-base font-extrabold text-emerald-400">{onChainStakedAds} ADS</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs bg-slate-900 border border-slate-700/60 px-3 py-1.5 rounded-lg text-slate-300">
              Status:{' '}
              <strong className={isQualifiedParticipant ? 'text-emerald-400' : 'text-amber-400'}>
                {isQualifiedParticipant ? 'Participant (10% Sell Limit)' : 'Standard (3% Sell Limit)'}
              </strong>
            </span>
          </div>
        </div>

        {/* TAB 1: MODULE 1 - ADS STAKING */}
        {activeTab === 'ads' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-[#151921] border border-slate-800 p-6 rounded-2xl shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Coins className="w-5 h-5 text-emerald-400" />
                    Module 1: ADS Staking (On-Chain)
                  </h2>
                  <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700">
                    450M ADS Finite Reserve
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
                  Stake ADS directly into the verified smart contract. Capital is returned at maturity in ADS tokens. 3% sell tax applies to reward withdrawals.
                </p>

                {/* Staking Duration Selector */}
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Choose Staking Lock Period
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                  {[
                    { days: 0, label: 'Flexible', roi: '0.20%' },
                    { days: 30, label: '30 Days', roi: '0.40%' },
                    { days: 90, label: '90 Days', roi: '0.60%' },
                    { days: 180, label: '180 Days', roi: '0.80%' },
                    { days: 360, label: '360 Days', roi: '1.00%' },
                  ].map((period) => (
                    <button
                      key={period.days}
                      onClick={() => setSelectedAdsPeriod(period.days)}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        selectedAdsPeriod === period.days
                          ? 'border-emerald-500 bg-emerald-500/10 text-white shadow-lg shadow-emerald-500/10'
                          : 'border-slate-800 bg-[#1a202c]/50 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-semibold">{period.label}</div>
                      <div className="text-sm font-extrabold text-emerald-400 mt-1">{period.roi}</div>
                      <div className="text-[10px] text-slate-500">Daily ROI</div>
                    </button>
                  ))}
                </div>

                {/* Amount Input */}
                <div className="mb-6">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    <span>Stake Amount (ADS)</span>
                    <span>Wallet Balance: {walletAdsBalance} ADS</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={adsAmount}
                      onChange={(e) => setAdsAmount(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-[#0d1015] border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3.5 text-lg font-bold text-white outline-none pr-28"
                    />
                    <div className="absolute right-2 top-2 flex items-center gap-1.5">
                      <button
                        onClick={() => setAdsAmount('5000')}
                        className="px-2 py-1 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        5K
                      </button>
                      <button
                        onClick={() => setAdsAmount('25000')}
                        className="px-2 py-1 text-xs font-bold rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                      >
                        25K
                      </button>
                    </div>
                  </div>
                </div>

                {/* Real On-Chain Stake Button */}
                <button
                  disabled={isProcessing}
                  onClick={handleOnChainStakeAds}
                  className="w-full py-4 rounded-xl font-extrabold text-base bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Coins className="w-5 h-5" />
                  {isProcessing ? 'Processing Transaction on BSC Testnet...' : 'Stake ADS on BSC Testnet'}
                </button>
              </div>
            </div>

            {/* Right Column: ROI Calculator */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-[#151921] border border-slate-800 p-6 rounded-2xl shadow-xl">
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  Staking Projection Calculator
                </h3>

                <div className="space-y-4 text-xs sm:text-sm">
                  <div className="flex justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400">Lock Period</span>
                    <span className="font-bold text-white">
                      {selectedAdsPeriod === 0 ? 'Flexible' : `${selectedAdsPeriod} Days Locked`}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400">Daily ROI Rate</span>
                    <span className="font-bold text-emerald-400">{adsDailyRate}% / day</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400">Estimated Daily Rewards</span>
                    <span className="font-bold text-white">{calculatedDailyAds.toFixed(2)} ADS</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400">Estimated Total Rewards</span>
                    <span className="font-bold text-emerald-400">
                      {calculatedTotalAds} {selectedAdsPeriod !== 0 ? 'ADS' : ''}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Withdrawal Base Tax</span>
                    <span className="font-bold text-amber-400">3% (routed to Treasury)</span>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                  💡 <strong>Direct Contract Execution:</strong> When you click Stake, MetaMask prompts you to approve and deposit directly into the verified Staking Vault contract on BSC Testnet!
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MODULE 2 - USDT ENTRY STAKING */}
        {activeTab === 'usdt' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-[#151921] border border-slate-800 p-6 rounded-2xl shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Flame className="w-5 h-5 text-amber-400" />
                    Module 2: USDT Staking Entry (On-Chain)
                  </h2>
                  <span className="text-xs bg-amber-500/10 text-amber-300 px-2.5 py-1 rounded-md border border-amber-500/20 font-bold">
                    1% Daily Reward
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
                  Accepts USDT on-chain: 80% automatically buys ADS from DEX and burns it, while 20% is routed to liquidity support.
                </p>

                {/* Multiplier Capping Table (Page 7) */}
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Return Multipliers & Capping (Section 5, Module 2)
                </label>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { range: '$10 - $999', multiplier: '2.0X', days: '200 Days' },
                    { range: '$1,000 - $4,999', multiplier: '2.5X', days: '250 Days' },
                    { range: '$5,000+', multiplier: '3.0X', days: '300 Days' },
                  ].map((tier, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border text-center ${
                        usdtCapMultiplier === parseFloat(tier.multiplier)
                          ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                          : 'border-slate-800 bg-[#1a202c]/50 text-slate-400'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-300">{tier.range}</div>
                      <div className="text-lg font-black text-amber-400 my-1">{tier.multiplier}</div>
                      <div className="text-[10px] text-slate-400">Cap at {tier.days}</div>
                    </div>
                  ))}
                </div>

                {/* USDT Amount Input */}
                <div className="mb-6">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    <span>Deposit USDT Amount</span>
                    <span>Wallet Balance: ${walletUsdtBalance} USDT</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={usdtAmount}
                      onChange={(e) => setUsdtAmount(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-[#0d1015] border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-3.5 text-lg font-bold text-white outline-none pr-28"
                    />
                    <div className="absolute right-2 top-2 flex items-center gap-1.5">
                      <button
                        onClick={() => setUsdtAmount('500')}
                        className="px-2 py-1 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        $500
                      </button>
                      <button
                        onClick={() => setUsdtAmount('1000')}
                        className="px-2 py-1 text-xs font-bold rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400"
                      >
                        $1000
                      </button>
                    </div>
                  </div>
                </div>

                {/* Real On-Chain Stake USDT Button */}
                <button
                  disabled={isProcessing}
                  onClick={handleOnChainStakeUsdt}
                  className="w-full py-4 rounded-xl font-extrabold text-base bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Flame className="w-5 h-5" />
                  {isProcessing ? 'Processing Transaction on BSC Testnet...' : 'Stake USDT on BSC Testnet (1% Daily)'}
                </button>
              </div>
            </div>

            {/* Right Column: Multiplier Capping Breakdown */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-[#151921] border border-slate-800 p-6 rounded-2xl shadow-xl">
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-amber-400" />
                  USDT Return & Capping Overview
                </h3>

                <div className="space-y-4 text-xs sm:text-sm">
                  <div className="flex justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400">Daily Payout</span>
                    <span className="font-bold text-amber-400">1.00% daily</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400">Applicable Cap Multiplier</span>
                    <span className="font-bold text-white">{usdtCapMultiplier}X Max Capping</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400">Max Cumulative Return</span>
                    <span className="font-bold text-amber-400">
                      ${((parsedUsdt * usdtCapMultiplier) || 0).toFixed(2)} USDT
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Withdrawal Base Tax</span>
                    <span className="font-bold text-slate-300">3% (routed to Treasury)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DASHBOARD & ON-CHAIN CLAIM */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#151921] border border-slate-800 p-5 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Your On-Chain Staked ADS</span>
                <div className="text-2xl font-black text-white">{onChainStakedAds} ADS</div>
                <span className="text-[10px] text-emerald-400 font-bold mt-1 block">Locked in Vault</span>
              </div>
              <div className="bg-[#151921] border border-slate-800 p-5 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Your On-Chain Staked USDT</span>
                <div className="text-2xl font-black text-amber-400">${onChainStakedUsdt} USDT</div>
                <span className="text-[10px] text-amber-300 font-bold mt-1 block">1% Daily Generating</span>
              </div>
              <div className="bg-[#151921] border border-slate-800 p-5 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Wallet ADS Balance</span>
                <div className="text-2xl font-black text-emerald-400">{walletAdsBalance} ADS</div>
                <span className="text-[10px] text-slate-500 mt-1 block">Liquid Balance</span>
              </div>
              <div className="bg-[#151921] border border-slate-800 p-5 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Wallet USDT Balance</span>
                <div className="text-2xl font-black text-amber-400">${walletUsdtBalance} USDT</div>
                <span className="text-[10px] text-slate-500 mt-1 block">Liquid Balance</span>
              </div>
            </div>

            {/* On-Chain Claim Rewards Center */}
            <div className="bg-[#151921] border border-slate-800 p-6 rounded-2xl shadow-xl">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                Claim Staking Rewards On-Chain (3% Tax Automatically Deducted)
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mb-6">
                When you click Claim, the smart contract calculates accrued rewards, automatically deducts the 3% base tax and routes it to the Treasury, and transfers the net 97% directly into your MetaMask wallet!
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block">ADS Staking Rewards</span>
                    <span className="text-lg font-bold text-white">Accruing daily at 0:01 AM UTC</span>
                  </div>
                  <button
                    disabled={isProcessing}
                    onClick={handleClaimAdsRewards}
                    className="px-5 py-2.5 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all text-xs disabled:opacity-50"
                  >
                    Claim ADS Rewards
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block">USDT Entry Rewards</span>
                    <span className="text-lg font-bold text-amber-400">1% Daily up to Cap</span>
                  </div>
                  <button
                    disabled={isProcessing}
                    onClick={handleClaimAdsRewards}
                    className="px-5 py-2.5 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all text-xs disabled:opacity-50"
                  >
                    Claim USDT Rewards
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: 3-LEVEL REFERRAL SYSTEM */}
        {activeTab === 'referrals' && (
          <div className="space-y-8">
            <div className="bg-[#151921] border border-slate-800 p-6 rounded-2xl shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-400" />
                    3-Level Referral Commission Structure (Section 5)
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Commissions are calculated based on the daily staking rewards generated by your referred users.
                  </p>
                </div>

                <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 px-3 py-2 rounded-xl text-xs">
                  <span className="text-slate-400 font-mono truncate max-w-[200px] sm:max-w-xs">{referralUrl}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(referralUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                  >
                    {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-5 rounded-xl bg-slate-900 border border-emerald-500/30 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 font-extrabold text-[10px] px-3 py-0.5 rounded-bl-lg">
                    DIRECT (L1)
                  </div>
                  <div className="text-3xl font-black text-emerald-400 mb-2">10%</div>
                  <h4 className="text-sm font-bold text-white mb-2">Level 1 Commission</h4>
                  <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4">
                    <li>Personal staking ≥ $100</li>
                    <li>Direct referral volume ≥ $100</li>
                    <li>Calculated on daily staking yields</li>
                  </ul>
                </div>

                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-slate-800 text-slate-300 font-extrabold text-[10px] px-3 py-0.5 rounded-bl-lg">
                    SECOND (L2)
                  </div>
                  <div className="text-3xl font-black text-emerald-400 mb-2">3%</div>
                  <h4 className="text-sm font-bold text-white mb-2">Level 2 Commission</h4>
                  <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4">
                    <li>At least 2 active direct referrals</li>
                    <li>Team volume ≥ $500</li>
                  </ul>
                </div>

                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-slate-800 text-slate-300 font-extrabold text-[10px] px-3 py-0.5 rounded-bl-lg">
                    THIRD (L3)
                  </div>
                  <div className="text-3xl font-black text-emerald-400 mb-2">2%</div>
                  <h4 className="text-sm font-bold text-white mb-2">Level 3 Commission</h4>
                  <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4">
                    <li>At least 3 active direct referrals</li>
                    <li>Team volume ≥ $1,000</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: COMMUNITY TIERS */}
        {activeTab === 'tiers' && (
          <div className="space-y-8">
            <div className="bg-[#151921] border border-slate-800 p-6 rounded-2xl shadow-xl">
              <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
                <Award className="w-5 h-5 text-amber-400" />
                Community Tier System (10% Flat-Rate Overriding Bonus)
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mb-6">
                Formula: <span className="font-mono text-amber-400 font-bold">Differential Bonus = Eligible Team Volume × (Your Tier % − Downline's Tier %)</span>
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase">
                      <th className="py-3 px-4">Tier Rank</th>
                      <th className="py-3 px-4">Personal Staking</th>
                      <th className="py-3 px-4">Weak-Leg Volume</th>
                      <th className="py-3 px-4">Tier Differential Bonus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {[
                      { tier: 'V1', stake: '100 USDT', weak: '5,000 USDT', bonus: '10%' },
                      { tier: 'V2', stake: '500 USDT', weak: '20,000 USDT', bonus: '20%' },
                      { tier: 'V3', stake: '1,000 USDT', weak: '50,000 USDT', bonus: '30%' },
                      { tier: 'V4', stake: '3,000 USDT', weak: '150,000 USDT', bonus: '35%' },
                      { tier: 'V5', stake: '5,000 USDT', weak: '500,000 USDT', bonus: '45%' },
                      { tier: 'V6', stake: '10,000 USDT', weak: '2,000,000 USDT', bonus: '55%' },
                    ].map((row) => (
                      <tr key={row.tier}>
                        <td className="py-3 px-4 font-black text-amber-400">{row.tier}</td>
                        <td className="py-3 px-4">{row.stake}</td>
                        <td className="py-3 px-4">{row.weak}</td>
                        <td className="py-3 px-4 font-bold text-emerald-400">{row.bonus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: DEPLOYED CONTRACTS & EXPLORER */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            <div className="bg-[#151921] border border-slate-800 p-6 rounded-2xl shadow-xl">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
                Live BSC Testnet Smart Contracts
              </h3>

              <div className="space-y-4 text-xs font-mono">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-400 block text-[11px]">ADSToken (1 Billion Fixed Supply):</span>
                    <span className="text-emerald-400 font-bold">{deployedAddresses.adsToken}</span>
                  </div>
                  <a
                    href={`https://testnet.bscscan.com/address/${deployedAddresses.adsToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-slate-300 hover:text-white underline text-xs"
                  >
                    <span>View on BscScan</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-400 block text-[11px]">ADSStakingVault Contract:</span>
                    <span className="text-emerald-400 font-bold">{deployedAddresses.stakingVault}</span>
                  </div>
                  <a
                    href={`https://testnet.bscscan.com/address/${deployedAddresses.stakingVault}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-slate-300 hover:text-white underline text-xs"
                  >
                    <span>View on BscScan</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Mock USDT Token:</span>
                    <span className="text-amber-400 font-bold">{deployedAddresses.usdtToken}</span>
                  </div>
                  <a
                    href={`https://testnet.bscscan.com/address/${deployedAddresses.usdtToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-slate-300 hover:text-white underline text-xs"
                  >
                    <span>View on BscScan</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Ecosystem Treasury & Deployer:</span>
                    <span className="text-white font-bold">{deployedAddresses.treasury}</span>
                  </div>
                  <a
                    href={`https://testnet.bscscan.com/address/${deployedAddresses.treasury}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-slate-300 hover:text-white underline text-xs"
                  >
                    <span>View on BscScan</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-[#0d1015] py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 Adstoken & Adsvilla Ecosystem. BEP-20 Fixed Supply Protocol.</p>
          <div className="flex items-center gap-4">
            <span className="text-emerald-400">BSC Testnet Active</span>
            <a href="http://localhost:5000/api/docs" target="_blank" rel="noreferrer" className="hover:text-slate-300">
              Swagger API Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
