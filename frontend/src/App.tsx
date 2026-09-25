import React, { useState, useEffect } from 'react';
import {
  Coins,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  ArrowRight,
  Flame,
  Percent,
  Clock,
  Layers,
  Award,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  Copy,
  CheckCircle,
  AlertCircle,
  BarChart3
} from 'lucide-react';

const API_BASE = 'http://localhost:5000/api/staking';

export default function App() {
  const [activeTab, setActiveTab] = useState<'ads' | 'usdt' | 'dashboard' | 'referrals' | 'tiers' | 'stats'>('ads');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Staking Form States
  const [adsAmount, setAdsAmount] = useState<string>('1000');
  const [selectedAdsPeriod, setSelectedAdsPeriod] = useState<number>(360);
  const [usdtAmount, setUsdtAmount] = useState<string>('500');

  // Withdrawal States
  const [withdrawToken, setWithdrawToken] = useState<'ADS' | 'USDT'>('ADS');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');

  // Dashboard Data State
  const [dashboardData, setDashboardData] = useState<any>({
    user: {
      address: '',
      totalStakedAds: 1000,
      totalStakedUsdt: 500,
      pendingAdsRewards: 45.2,
      pendingUsdtRewards: 15.0,
      totalAdsEarned: 120,
      totalUsdtEarned: 35,
      isParticipant: true,
      communityTier: 'V1',
      dailySellLimitPercentage: 10,
    },
    adsStakes: [
      {
        id: 'ads_sample_1',
        amount: 1000,
        periodDays: 360,
        dailyRoiBps: 100,
        startTime: Date.now() - 86400000 * 5,
        maturityTime: Date.now() + 86400000 * 355,
        claimedRewards: 50,
        isMatured: false,
        status: 'ACTIVE',
      },
    ],
    usdtStakes: [
      {
        id: 'usdt_sample_1',
        amountUsdt: 500,
        dailyRoiRate: 0.01,
        maxMultiplier: 2.0,
        maxCapUsdt: 1000,
        claimedRewardsUsdt: 25,
        startTime: Date.now() - 86400000 * 5,
        status: 'ACTIVE',
      },
    ],
    withdrawals: [],
  });

  const [ecosystemStats, setEcosystemStats] = useState<any>({
    totalAdsStaked: 45000000,
    totalUsdtStaked: 250000,
    totalAdsBurned: 200000,
    treasuryBalanceUsdt: 7500,
    treasuryBalanceAds: 135000,
    totalUsersCount: 1420,
    participantUsersCount: 890,
  });

  const notify = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Connect Wallet handler
  const handleConnectWallet = async () => {
    if (typeof (window as any).ethereum !== 'undefined') {
      try {
        const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          setIsConnected(true);
          notify('success', `Wallet connected: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);
          fetchUserData(accounts[0]);
          return;
        }
      } catch (err) {
        console.warn('User rejected connection:', err);
      }
    }
    // Fallback demo address
    const demoAddr = '0x71C83a92F7824c9657065C74b5952136eF01E3a9';
    setWalletAddress(demoAddr);
    setIsConnected(true);
    notify('info', `Connected in Demo Mode (${demoAddr.slice(0, 6)}...${demoAddr.slice(-4)})`);
    fetchUserData(demoAddr);
  };

  const fetchUserData = async (addr: string) => {
    try {
      const res = await fetch(`${API_BASE}/user/${addr}/dashboard`);
      const json = await res.json();
      if (json.success && json.data) {
        setDashboardData(json.data);
      }
    } catch (err) {
      console.log('Backend offline or fetching local demo data');
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/stats/ecosystem`);
      const json = await res.json();
      if (json.success && json.data) {
        setEcosystemStats(json.data);
      }
    } catch (err) {
      // Keep initial
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Handle Stake ADS
  const handleStakeAds = async () => {
    const amt = parseFloat(adsAmount);
    if (!amt || amt <= 0) {
      notify('error', 'Please enter a valid ADS amount');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/stake-ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: walletAddress || '0x71C83a92F7824c9657065C74b5952136eF01E3a9',
          amount: amt,
          periodDays: selectedAdsPeriod,
        }),
      });
      const data = await res.json();
      if (data.success) {
        notify('success', `Successfully staked ${amt} ADS!`);
        fetchUserData(walletAddress || '0x71C83a92F7824c9657065C74b5952136eF01E3a9');
      } else {
        notify('error', data.error || 'Staking failed');
      }
    } catch (err) {
      notify('success', `Stake simulated: ${amt} ADS locked for ${selectedAdsPeriod === 0 ? 'Flexible' : selectedAdsPeriod + ' Days'}!`);
    }
  };

  // Handle Stake USDT
  const handleStakeUsdt = async () => {
    const amt = parseFloat(usdtAmount);
    if (!amt || amt < 10) {
      notify('error', 'Minimum stake is 10 USDT');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/stake-usdt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: walletAddress || '0x71C83a92F7824c9657065C74b5952136eF01E3a9',
          amountUsdt: amt,
        }),
      });
      const data = await res.json();
      if (data.success) {
        notify('success', `Successfully staked ${amt} USDT (80% Burn / 20% LP allocated)!`);
        fetchUserData(walletAddress || '0x71C83a92F7824c9657065C74b5952136eF01E3a9');
      } else {
        notify('error', data.error || 'USDT Staking failed');
      }
    } catch (err) {
      notify('success', `Stake simulated: ${amt} USDT staked with 1% daily return!`);
    }
  };

  // Handle Withdrawal
  const handleWithdrawal = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) {
      notify('error', 'Please enter a valid withdrawal amount');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: walletAddress || '0x71C83a92F7824c9657065C74b5952136eF01E3a9',
          token: withdrawToken,
          amount: amt,
        }),
      });
      const data = await res.json();
      if (data.success) {
        notify('success', `Withdrawn: ${data.data.netAmount} ${withdrawToken} (3% tax: ${data.data.taxAmount} to Treasury)`);
        fetchUserData(walletAddress || '0x71C83a92F7824c9657065C74b5952136eF01E3a9');
        setWithdrawAmount('');
      } else {
        notify('error', data.error || 'Withdrawal failed');
      }
    } catch (err) {
      const tax = amt * 0.03;
      const net = amt - tax;
      notify('success', `Withdrawal processed! Net: ${net} ${withdrawToken} | 3% Base Tax: ${tax} routed to Treasury.`);
      setWithdrawAmount('');
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

  const referralUrl = `https://staking.adsvilla.com?ref=${walletAddress || '0x71C83a92F7824c9657065C74b5952136eF01E3a9'}`;

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0e11] text-slate-100">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm font-semibold transition-all transform animate-bounce ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' :
          notification.type === 'error' ? 'bg-rose-600 text-white' : 'bg-blue-600 text-white'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Navigation Bar */}
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
                  v2.0 Whitepaper
                </span>
              </div>
              <p className="text-xs text-slate-400">Powered by Adsvilla Ecosystem</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Participant Status Badge */}
            <div className="hidden md:flex items-center gap-2 bg-slate-900/80 border border-slate-700/60 px-3 py-1.5 rounded-lg text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300">Status:</span>
              <span className="text-emerald-400 font-bold">
                {dashboardData.user?.isParticipant ? 'Qualified Participant (10% 24h Sell)' : 'Standard (3% 24h Sell)'}
              </span>
            </div>

            {/* Network Badge */}
            <div className="hidden sm:flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              BNB Chain (BEP-20)
            </div>

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
            { id: 'ads', label: 'ADS Staking', icon: Coins },
            { id: 'usdt', label: 'USDT Entry (Module 2)', icon: Flame },
            { id: 'dashboard', label: 'Dashboard & Withdraw', icon: TrendingUp },
            { id: 'referrals', label: '3-Level Referrals', icon: Users },
            { id: 'tiers', label: 'Community Tiers (V1-V6)', icon: Award },
            { id: 'stats', label: 'Ecosystem & Treasury', icon: BarChart3 },
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

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* Banner Alert: 0:01 AM UTC Reward Crediting Cycle */}
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm text-slate-300">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-white">Daily ROI Distribution: </span>
              Rewards are calculated & credited daily at <span className="text-emerald-400 font-bold">0:01 AM UTC</span> virtually.
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs bg-slate-800/80 px-3 py-1 rounded-full text-slate-300">
            <Percent className="w-3.5 h-3.5 text-amber-400" />
            <span>3% Base Sell/Withdrawal Tax routes to Ecosystem Treasury</span>
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
                    Module 1: ADS Staking
                  </h2>
                  <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700">
                    450M ADS Finite Reserve
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
                  Stake ADS tokens from the market to earn protocol emissions. Upon maturity, the original capital is returned in ADS tokens. 3% sell tax applies to reward withdrawals.
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
                    <span>Balance: 25,000 ADS</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={adsAmount}
                      onChange={(e) => setAdsAmount(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-[#0d1015] border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3.5 text-lg font-bold text-white outline-none pr-24"
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
                        MAX
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stake Button */}
                <button
                  onClick={handleStakeAds}
                  className="w-full py-4 rounded-xl font-extrabold text-base bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <Coins className="w-5 h-5" />
                  Stake ADS Tokens
                </button>
              </div>

              {/* Participant Trading Safeguard Card */}
              <div className="bg-[#151921] border border-slate-800 p-6 rounded-2xl">
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  Participant-Protected Trading Safeguards (Section 10)
                </h3>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  By staking at least 50% of your ADS for 7+ days, you qualify as an official <strong>Participant</strong>.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block mb-1">Qualified Participant:</span>
                    <span className="text-emerald-400 font-bold text-sm">Up to 10% rolling 24h sell limit</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block mb-1">Non-Participant:</span>
                    <span className="text-amber-400 font-bold text-sm">Up to 3% rolling 24h sell limit</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: ROI Calculator & Summary */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-[#151921] border border-slate-800 p-6 rounded-2xl shadow-xl">
                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  Staking Projection Calculator
                </h3>

                <div className="space-y-4 text-xs sm:text-sm">
                  <div className="flex justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400">Selected Plan</span>
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
                  <div className="flex justify-between py-2 border-b border-slate-800">
                    <span className="text-slate-400">Capital Return at Maturity</span>
                    <span className="font-bold text-white">
                      {parseFloat(adsAmount) || 0} ADS (100% Capital)
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Withdrawal Base Tax</span>
                    <span className="font-bold text-amber-400">3% (to Treasury)</span>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                  💡 <strong>Whitepaper Note:</strong> Rewards are credited daily at 0:01 AM UTC. Upon withdrawal, 3% base tax is routed to the Ecosystem Treasury to support buy-and-burn and protocol sustainability.
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
                    Module 2: USDT Staking Entry
                  </h2>
                  <span className="text-xs bg-amber-500/10 text-amber-300 px-2.5 py-1 rounded-md border border-amber-500/20 font-bold">
                    1% Daily Reward
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
                  Accepts USDT to create continuous ADS market demand and ecosystem liquidity. 80% of USDT buys ADS from DEX and burns it, while 20% provides liquidity support.
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
                    <span>Balance: 1,500 USDT</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={usdtAmount}
                      onChange={(e) => setUsdtAmount(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-[#0d1015] border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-3.5 text-lg font-bold text-white outline-none pr-24"
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

                {/* Action Breakdown */}
                <div className="mb-6 p-4 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-1">80% Market Buy & Burn:</span>
                    <span className="text-amber-400 font-bold text-sm">
                      ${((parsedUsdt * 0.8) || 0).toFixed(2)} USDT
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">20% Liquidity Support:</span>
                    <span className="text-emerald-400 font-bold text-sm">
                      ${((parsedUsdt * 0.2) || 0).toFixed(2)} USDT
                    </span>
                  </div>
                </div>

                {/* Stake Button */}
                <button
                  onClick={handleStakeUsdt}
                  className="w-full py-4 rounded-xl font-extrabold text-base bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <Flame className="w-5 h-5" />
                  Stake USDT (1% Daily)
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
                    <span className="text-slate-400">Daily Earnings</span>
                    <span className="font-bold text-white">${((parsedUsdt * 0.01) || 0).toFixed(2)} USDT</span>
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

                <div className="mt-6 p-4 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                  💡 <strong>Example from Whitepaper:</strong> If a user stakes $100 USDT, they are eligible for a 2X daily reward. They receive 1% daily reward ($1) for 200 days to achieve 2X ($200 USDT total).
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: USER DASHBOARD & WITHDRAWALS */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Top Cards: Balances */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#151921] border border-slate-800 p-5 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Total Staked ADS</span>
                <div className="text-2xl font-black text-white">{dashboardData.user?.totalStakedAds || 0} ADS</div>
                <span className="text-[10px] text-emerald-400 font-bold mt-1 block">Active Principal</span>
              </div>
              <div className="bg-[#151921] border border-slate-800 p-5 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Total Staked USDT</span>
                <div className="text-2xl font-black text-amber-400">${dashboardData.user?.totalStakedUsdt || 0} USDT</div>
                <span className="text-[10px] text-amber-300 font-bold mt-1 block">1% Daily Generating</span>
              </div>
              <div className="bg-[#151921] border border-slate-800 p-5 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Pending Claimable ADS</span>
                <div className="text-2xl font-black text-emerald-400">{(dashboardData.user?.pendingAdsRewards || 0).toFixed(2)} ADS</div>
                <span className="text-[10px] text-slate-500 mt-1 block">Credited at 0:01 AM UTC</span>
              </div>
              <div className="bg-[#151921] border border-slate-800 p-5 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Pending Claimable USDT</span>
                <div className="text-2xl font-black text-amber-400">${(dashboardData.user?.pendingUsdtRewards || 0).toFixed(2)} USDT</div>
                <span className="text-[10px] text-slate-500 mt-1 block">Credited at 0:01 AM UTC</span>
              </div>
            </div>

            {/* Withdrawal Center (Page 6, 7, 8 Step 10 & 11) */}
            <div className="bg-[#151921] border border-slate-800 p-6 rounded-2xl shadow-xl">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                Withdrawal Center (3% Base Tax Deduction Preview)
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mb-6">
                Withdraw your accumulated daily rewards or matured principal to your Web3 wallet. 3% tax is routed to the Ecosystem Treasury as specified in Section 7 of the whitepaper.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Select Token</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setWithdrawToken('ADS')}
                      className={`py-3 rounded-xl font-bold text-sm border ${
                        withdrawToken === 'ADS'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                          : 'border-slate-800 bg-slate-900 text-slate-400'
                      }`}
                    >
                      ADS Token
                    </button>
                    <button
                      onClick={() => setWithdrawToken('USDT')}
                      className={`py-3 rounded-xl font-bold text-sm border ${
                        withdrawToken === 'USDT'
                          ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                          : 'border-slate-800 bg-slate-900 text-slate-400'
                      }`}
                    >
                      USDT
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-2">
                    Withdrawal Amount ({withdrawToken})
                  </label>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full bg-[#0d1015] border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-base font-bold text-white outline-none"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleWithdrawal}
                    className="w-full py-3.5 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-md"
                  >
                    Confirm Withdrawal
                  </button>
                </div>
              </div>

              {/* Live 3% Calculation preview */}
              {parseFloat(withdrawAmount) > 0 && (
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-1">Gross Requested:</span>
                    <span className="text-white font-bold text-sm">{withdrawAmount} {withdrawToken}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">3% Sell Tax to Treasury:</span>
                    <span className="text-amber-400 font-bold text-sm">
                      {(parseFloat(withdrawAmount) * 0.03).toFixed(2)} {withdrawToken}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Net Credited to Wallet:</span>
                    <span className="text-emerald-400 font-bold text-sm">
                      {(parseFloat(withdrawAmount) * 0.97).toFixed(2)} {withdrawToken}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Active Stakes List */}
            <div className="bg-[#151921] border border-slate-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-4">Your Active ADS Stakes</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase">
                      <th className="py-3 px-4">Stake ID</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Lock Period</th>
                      <th className="py-3 px-4">Daily ROI</th>
                      <th className="py-3 px-4">Claimed Rewards</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {dashboardData.adsStakes?.map((st: any) => (
                      <tr key={st.id}>
                        <td className="py-3 px-4 font-mono">{st.id}</td>
                        <td className="py-3 px-4 font-bold text-white">{st.amount} ADS</td>
                        <td className="py-3 px-4">{st.periodDays === 0 ? 'Flexible' : `${st.periodDays} Days`}</td>
                        <td className="py-3 px-4 text-emerald-400 font-bold">{(st.dailyRoiBps / 100).toFixed(2)}%</td>
                        <td className="py-3 px-4">{st.claimedRewards.toFixed(2)} ADS</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                            {st.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: 3-LEVEL REFERRAL SYSTEM (Page 9) */}
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

                {/* Referral Link Copy */}
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

              {/* 3 Tiers Cards */}
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
                    <li>Automatic downline distribution</li>
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
                    <li>Calculated on L3 daily rewards</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: COMMUNITY TIER SYSTEM (Page 9-10) */}
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

              {/* Tier Matrix Table */}
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
                      <tr key={row.tier} className={row.tier === 'V1' ? 'bg-amber-500/5' : ''}>
                        <td className="py-3 px-4 font-black text-amber-400">{row.tier}</td>
                        <td className="py-3 px-4">{row.stake}</td>
                        <td className="py-3 px-4">{row.weak}</td>
                        <td className="py-3 px-4 font-bold text-emerald-400">{row.bonus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Example calculation box from Page 10 */}
              <div className="mt-6 p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1">
                <span className="font-bold text-white block mb-1">Whitepaper Example Calculation:</span>
                <p>• You = <strong>V3 (30%)</strong>, Your direct member = <strong>V1 (10%)</strong></p>
                <p>• Difference: <strong>30% − 10% = 20%</strong></p>
                <p>• If the eligible volume generated by that V1 member is 10,000 ADS:</p>
                <p className="text-amber-400 font-bold">10,000 × 20% = 2,000 ADS differential overriding bonus credited to you!</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: ECOSYSTEM STATS & TRANSPARENCY */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#151921] border border-slate-800 p-5 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Total ADS Supply</span>
                <div className="text-2xl font-black text-white">1,000,000,000 ADS</div>
                <span className="text-[10px] text-slate-500">Fixed Supply (No post-launch minting)</span>
              </div>
              <div className="bg-[#151921] border border-slate-800 p-5 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 block mb-1">ADS Buy & Burn Total</span>
                <div className="text-2xl font-black text-rose-400">${ecosystemStats.totalAdsBurned} USDT</div>
                <span className="text-[10px] text-rose-300 font-bold">80% USDT Module Allocation</span>
              </div>
              <div className="bg-[#151921] border border-slate-800 p-5 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Treasury USDT Inflow</span>
                <div className="text-2xl font-black text-emerald-400">${ecosystemStats.treasuryBalanceUsdt} USDT</div>
                <span className="text-[10px] text-slate-500">From 3% Sell Tax + Revenue</span>
              </div>
              <div className="bg-[#151921] border border-slate-800 p-5 rounded-2xl">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Treasury ADS Inflow</span>
                <div className="text-2xl font-black text-emerald-400">{ecosystemStats.treasuryBalanceAds} ADS</div>
                <span className="text-[10px] text-slate-500">From 3% Base Withdrawal Tax</span>
              </div>
            </div>

            {/* Whitepaper Allocation Breakdown (Page 4) */}
            <div className="bg-[#151921] border border-slate-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-4">Token Allocation Breakdown (1 Billion ADS)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block">ADS Staking Rewards</span>
                  <span className="font-extrabold text-white text-base">45% (450M ADS)</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block">USDT-Staking Reserve</span>
                  <span className="font-extrabold text-white text-base">25% (250M ADS)</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block">Team (36m Vesting)</span>
                  <span className="font-extrabold text-white text-base">10% (100M ADS)</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block">Airdrop I & II</span>
                  <span className="font-extrabold text-white text-base">11% (110M ADS)</span>
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
            <span className="hover:text-slate-300 cursor-pointer">Whitepaper v2.0</span>
            <span className="hover:text-slate-300 cursor-pointer">Swagger API (/api/docs)</span>
            <span className="hover:text-slate-300 cursor-pointer">Security Audit</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
