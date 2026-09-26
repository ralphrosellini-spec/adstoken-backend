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
  ArrowRight,
  ArrowDown,
  Layers,
  ChevronRight,
  RefreshCw,
  Droplets,
  Zap,
  Sparkles,
  Info,
  Check,
  Settings,
  HelpCircle,
  Lock,
  Unlock,
  ChevronDown,
  LogOut
} from 'lucide-react';
import { ethers, BrowserProvider, Contract, formatEther, parseEther } from 'ethers';
import deployedAddresses from './contracts/deployedAddresses.json';
import { ERC20_ABI, MOCK_USDT_ABI, VAULT_ABI, SWAP_ABI } from './contracts/abis';

export default function App() {
  // Navigation: 'dashboard' | 'stake' | 'withdrawal' | 'referrals' | 'tools'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stake' | 'withdrawal' | 'referrals' | 'tools'>('dashboard');

  // Sub-modes
  const [dashboardMode, setDashboardMode] = useState<'ads' | 'usdt'>('ads');
  const [stakeMode, setStakeMode] = useState<'ads' | 'usdt'>('ads');

  // Wallet
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isTestnet, setIsTestnet] = useState<boolean>(false);
  const [showWalletModal, setShowWalletModal] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string; txHash?: string } | null>(null);

  // Balances
  const [walletAdsBalance, setWalletAdsBalance] = useState<string>('0.00');
  const [walletUsdtBalance, setWalletUsdtBalance] = useState<string>('0.00');
  const [onChainStakedAds, setOnChainStakedAds] = useState<string>('0.00');
  const [onChainStakedUsdt, setOnChainStakedUsdt] = useState<string>('0.00');
  const [pendingAdsRewards, setPendingAdsRewards] = useState<string>('0.00');
  const [pendingUsdtRewards, setPendingUsdtRewards] = useState<string>('0.00');
  const [activePlansCount, setActivePlansCount] = useState<number>(0);

  // ADS Staking Flow State (Steps 5, 6, 7, 8 in Image 1)
  const [stakeUsdtInput, setStakeUsdtInput] = useState<string>('1000');
  const [selectedAdsPeriod, setSelectedAdsPeriod] = useState<number>(360);

  // USDT Staking Flow State (Steps 5, 6, 7, 8 in Image 2)
  const [usdtDepositInput, setUsdtDepositInput] = useState<string>('1000');

  // Withdrawal Flow State (Steps 10, 11, 12, 13)
  const [withdrawToken, setWithdrawToken] = useState<'ADS' | 'USDT'>('ADS');
  const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>('100');

  // Processing state & step descriptions
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStep, setProcessingStep] = useState<string>('');

  const notify = (type: 'success' | 'error' | 'info', message: string, txHash?: string) => {
    setNotification({ type, message, txHash });
    setTimeout(() => setNotification(null), 8000);
  };

  // Load Blockchain Data
  const loadBlockchainData = async (addr: string) => {
    if (typeof (window as any).ethereum === 'undefined' || !addr) return;
    try {
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
      setOnChainStakedAds(parseFloat(formatEther(rawStakedAds)).toFixed(2));
      setOnChainStakedUsdt(parseFloat(formatEther(rawStakedUsdt)).toFixed(2));

      const totalPlans = Number(adsStakesCount) + Number(usdtStakesCount);
      setActivePlansCount(totalPlans);

      // Read pending rewards across all active stakes
      let totalAdsPending = 0;
      for (let i = 0; i < Number(adsStakesCount); i++) {
        const p = await vaultContract.calculatePendingAdsReward(addr, i).catch(() => 0n);
        totalAdsPending += parseFloat(formatEther(p));
      }
      setPendingAdsRewards(totalAdsPending.toFixed(2));

      let totalUsdtPending = 0;
      for (let i = 0; i < Number(usdtStakesCount); i++) {
        const p = await vaultContract.calculatePendingUsdtReward(addr, i).catch(() => 0n);
        totalUsdtPending += parseFloat(formatEther(p));
      }
      setPendingUsdtRewards(totalUsdtPending.toFixed(2));
    } catch (err) {
      console.error('Error loading blockchain data:', err);
    }
  };

  // Connect Wallet
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
          notify('success', `Connected to ${walletName}: ${userAddr.slice(0, 6)}...${userAddr.slice(-4)}`);
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
        params: [{ chainId: '0x61' }], // 97 in hex
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

  // Auto-connect on mount
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
    setPendingAdsRewards('0.00');
    setPendingUsdtRewards('0.00');
    setActivePlansCount(0);
    notify('info', 'Wallet disconnected successfully');
  };

  // Add custom token to MetaMask via wallet_watchAsset
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
  // ADS STAKING FLOW (Image 1: Steps 5, 6, 7, 8)
  // User enters USDT -> System calculates ADS at $0.50 -> Buys ADS & Stakes!
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
      const adsContract = new Contract(deployedAddresses.adsToken, ERC20_ABI, signer);
      const swapContract = new Contract(deployedAddresses.adsSwap, SWAP_ABI, signer);
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);

      const parsedUsdt = parseEther(stakeUsdtInput);
      const expectedAds = parseEther((usdtAmt * 2).toString()); // 1 USDT = 2 ADS ($0.50 price)

      // Step 1: Approve USDT to Swap
      setProcessingStep('Step 1/3: Approving USDT to buy ADS...');
      notify('info', 'Step 1/3: Please approve USDT in MetaMask...');
      const approveUsdtTx = await usdtContract.approve(deployedAddresses.adsSwap, parsedUsdt);
      await approveUsdtTx.wait();

      // Step 2: System Buy ADS (Step 8 in Image 1)
      setProcessingStep('Step 2/3: System Buying ADS from market at $0.50...');
      notify('info', `Step 2/3: Buying ${usdtAmt * 2} ADS tokens with ${usdtAmt} USDT...`);
      const swapTx = await swapContract.swapUSDTForADS(parsedUsdt);
      await swapTx.wait();

      // Step 3: Approve & Stake ADS in StakingVault
      setProcessingStep('Step 3/3: Staking ADS in Vault...');
      notify('info', 'Step 3/3: Approving ADS & Starting Staking...');
      const approveAdsTx = await adsContract.approve(deployedAddresses.stakingVault, expectedAds);
      await approveAdsTx.wait();

      const stakeTx = await vaultContract.stakeADS(expectedAds, selectedAdsPeriod);
      await stakeTx.wait();

      notify('success', `🎉 Staking Started Successfully! Staked ${usdtAmt * 2} ADS for ${selectedAdsPeriod === 0 ? 'Flexible' : selectedAdsPeriod + ' Days'}!`, stakeTx.hash);
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
  // USDT STAKING FLOW (Image 2: Steps 5, 6, 7)
  // User enters USDT -> 80% Buy-Burn, 20% LP -> 1% Daily Yield up to Multiplier
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
      notify('info', 'Step 2/2: Confirming USDT Stake...');
      const stakeTx = await vaultContract.stakeUSDT(parsedUsdt);
      await stakeTx.wait();

      notify('success', `🎉 Stake & Earn Started! Staked ${amt} USDT at 1% Daily!`, stakeTx.hash);
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
  // WITHDRAWAL FLOW (Steps 10, 11, 12, 13)
  // Select token -> 3% Tax to Treasury -> Net 97% credited to wallet!
  // =========================================================================
  const handleWithdrawal = async () => {
    if (!isConnected) { setShowWalletModal(true); return; }
    try {
      setIsProcessing(true);
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);

      if (withdrawToken === 'ADS') {
        setProcessingStep('Processing ADS Withdrawal (3% Tax Deducted)...');
        notify('info', 'Confirming ADS Reward Withdrawal in MetaMask...');
        const tx = await vaultContract.claimAdsRewards();
        await tx.wait();
        notify('success', '✅ ADS Token Credited to User Wallet! (3% Tax sent to Treasury)', tx.hash);
      } else {
        setProcessingStep('Processing USDT Withdrawal (3% Tax Deducted)...');
        notify('info', 'Confirming USDT Reward Withdrawal in MetaMask...');
        const tx = await vaultContract.claimUsdtRewards();
        await tx.wait();
        notify('success', '✅ USDT Credited to User Wallet! (3% Tax sent to Treasury)', tx.hash);
      }
      loadBlockchainData(walletAddress);
    } catch (err: any) {
      notify('error', err.reason || err.message || 'Withdrawal failed. Make sure you have accrued rewards.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Step 13: Maturity Payout / Instant Capital Return
  const handleWithdrawPrincipal = async () => {
    if (!isConnected) { setShowWalletModal(true); return; }
    try {
      setIsProcessing(true);
      setProcessingStep('Unlocking Staked ADS Capital...');
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);

      notify('info', 'Confirming Capital Return in MetaMask (Zero-Wait Unlock)...');
      const tx = await vaultContract.withdrawAdsPrincipal(0);
      await tx.wait();
      notify('success', '✅ 100% Capital Returned to Your Wallet!', tx.hash);
      loadBlockchainData(walletAddress);
    } catch (err: any) {
      notify('error', err.reason || err.message || 'Maturity withdrawal failed.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Instant Testing Helpers
  const handleFastForwardAdsDays = async (days = 10) => {
    if (!isConnected) { setShowWalletModal(true); return; }
    try {
      setIsProcessing(true);
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);
      const tx = await vaultContract.testnetInstantAddDaysReward(0, days);
      await tx.wait();
      notify('success', `⚡ Added ${days} Days of Staking Rewards Instantly!`, tx.hash);
      loadBlockchainData(walletAddress);
    } catch (err: any) {
      notify('error', 'Please stake ADS first to generate rewards.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFastForwardUsdtCap = async () => {
    if (!isConnected) { setShowWalletModal(true); return; }
    try {
      setIsProcessing(true);
      const provider = new BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vaultContract = new Contract(deployedAddresses.stakingVault, VAULT_ABI, signer);
      const tx = await vaultContract.testnetInstantFillUsdtCap(0);
      await tx.wait();
      notify('success', '⚡ Reached 100% Max Return Cap Instantly! Ready to withdraw.', tx.hash);
      loadBlockchainData(walletAddress);
    } catch (err: any) {
      notify('error', 'Please stake USDT first to max out cap.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculations for ADS Staking Flow
  const parsedUsdtStake = parseFloat(stakeUsdtInput) || 0;
  const calculatedAdsQuantity = parsedUsdtStake * 2; // $0.50 price -> 2 ADS per USDT
  const getRoiBps = () => {
    switch (selectedAdsPeriod) {
      case 0: return { pct: '0.2% daily', label: 'Flexible Period' };
      case 30: return { pct: '0.4% daily', label: '30 Days' };
      case 90: return { pct: '0.6% daily', label: '90 Days' };
      case 180: return { pct: '0.8% daily', label: '180 Days' };
      case 360: return { pct: '1% daily', label: '360 Days' };
      default: return { pct: '1% daily', label: '360 Days' };
    }
  };

  // Calculations for USDT Staking Flow
  const parsedUsdtDeposit = parseFloat(usdtDepositInput) || 0;
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

  // Referral URL
  const referralUrl = `https://adstoken.vercel.app?ref=${walletAddress ? walletAddress.slice(0, 8) : '0x12ABCD'}`;

  return (
    <div className="min-h-screen bg-[#090d14] text-slate-100 flex flex-col items-center justify-start font-sans antialiased selection:bg-blue-600 selection:text-white">

      {/* MOBILE FRAME CONTAINER (Matches user request: specifically designed for mobile) */}
      <div className="w-full max-w-md min-h-screen bg-[#0f141d] border-x border-slate-800/80 flex flex-col shadow-2xl relative pb-24">

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
                  <span>Disconnect</span>
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

        {/* NOTIFICATION TOAST */}
        {notification && (
          <div className={`mx-3 mt-3 p-3 rounded-xl text-xs font-semibold flex items-start gap-2.5 shadow-lg border animate-in fade-in slide-in-from-top-2 z-50 ${
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

        {/* QUICK DEMO FAUCET CHIP */}
        <div className="px-4 pt-3 flex items-center justify-between text-[11px] text-slate-400">
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

        {/* 🦊 1-CLICK CUSTOM TOKEN IMPORT BUTTONS FOR METAMASK */}
        <div className="px-4 pt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => handleImportTokenToMetaMask('ADS')}
            className="py-1.5 px-2 rounded-xl bg-[#141b27] border border-slate-700/80 hover:border-emerald-500/60 text-slate-200 hover:text-emerald-300 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm group"
            title="Add custom ADS token to MetaMask"
          >
            <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[9px] font-black flex items-center justify-center shrink-0">A</span>
            <span className="truncate">+ Add ADS to MetaMask</span>
          </button>

          <button
            onClick={() => handleImportTokenToMetaMask('USDT')}
            className="py-1.5 px-2 rounded-xl bg-[#141b27] border border-slate-700/80 hover:border-amber-500/60 text-slate-200 hover:text-amber-300 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm group"
            title="Add custom USDT token to MetaMask"
          >
            <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center shrink-0">₮</span>
            <span className="truncate">+ Add USDT to MetaMask</span>
          </button>
        </div>

        {/* MAIN BODY SCROLLABLE AREA */}
        <main className="flex-1 p-4 space-y-4">

          {/* ================================================================= */}
          {/* TAB 1: DASHBOARD (Matching Step 4 in Image 1 & Image 2)           */}
          {/* ================================================================= */}
          {activeTab === 'dashboard' && (
            <div className="space-y-4 animate-in fade-in duration-200">

              {/* Segmented Mode Selector: ADS Staking vs USDT Staking */}
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

              {/* DASHBOARD CARD — ADS STAKING (Matches Step 4 of Image 1) */}
              {dashboardMode === 'ads' && (
                <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Staking Dashboard</span>
                    <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">
                      {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : '0x12...ABCD'}
                    </span>
                  </div>

                  {/* 4 Stats Grid (Exact from Step 4 in Image 1) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">My Staked</span>
                      <div className="text-lg font-black text-white">${(parseFloat(onChainStakedAds) * 0.50).toFixed(2)}</div>
                      <span className="text-[9px] text-emerald-400 block mt-0.5">{onChainStakedAds} ADS</span>
                    </div>

                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">Total Rewards</span>
                      <div className="text-lg font-black text-emerald-400">{pendingAdsRewards} ADS</div>
                      <span className="text-[9px] text-slate-500 block mt-0.5">Ready to Claim</span>
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

                  {/* Big Blue Button: "Start Staking" (Exact from Step 4 in Image 1) */}
                  <button
                    onClick={() => { setStakeMode('ads'); setActiveTab('stake'); }}
                    className="w-full py-3.5 rounded-xl font-black bg-blue-600 hover:bg-blue-500 text-white text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30"
                  >
                    Start Staking
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* DASHBOARD CARD — USDT STAKING (Matches Step 4 of Image 2) */}
              {dashboardMode === 'usdt' && (
                <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">USDT Staking Dashboard</span>
                    <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                      {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : '0x12...ABCD'}
                    </span>
                  </div>

                  {/* 1% Daily Highlight Banner */}
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300">Daily Return Rate</span>
                    <span className="text-xs font-black text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-md">1% DAILY</span>
                  </div>

                  {/* 4 Stats Grid (Exact from Step 4 in Image 2) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">My Staked</span>
                      <div className="text-lg font-black text-amber-400">${onChainStakedUsdt} USDT</div>
                      <span className="text-[9px] text-slate-500 block mt-0.5">USDT Principal</span>
                    </div>

                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">Total Rewards</span>
                      <div className="text-lg font-black text-emerald-400">${pendingUsdtRewards} USDT</div>
                      <span className="text-[9px] text-slate-500 block mt-0.5">Accrued Rewards</span>
                    </div>

                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">Daily Reward</span>
                      <div className="text-lg font-black text-white">1%</div>
                      <span className="text-[9px] text-emerald-400 block mt-0.5">Credited Daily</span>
                    </div>

                    <div className="bg-[#0e141f] border border-slate-800/80 rounded-xl p-3">
                      <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">Max Payout</span>
                      <div className="text-lg font-black text-amber-300">2X – 3X</div>
                      <span className="text-[9px] text-slate-500 block mt-0.5">Multiplier Cap</span>
                    </div>
                  </div>

                  {/* Big Blue Button: "Stake Now" (Exact from Step 4 in Image 2) */}
                  <button
                    onClick={() => { setStakeMode('usdt'); setActiveTab('stake'); }}
                    className="w-full py-3.5 rounded-xl font-black bg-blue-600 hover:bg-blue-500 text-white text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30"
                  >
                    Stake Now
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* QUICK REWARD CLAIM ACTION CARD */}
              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Available Rewards
                  </span>
                  <span className="text-[10px] text-slate-400">3% Base Tax on Claim</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">ADS Rewards</span>
                    <span className="text-sm font-black text-white">{pendingAdsRewards} ADS</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">USDT Rewards</span>
                    <span className="text-sm font-black text-amber-400">${pendingUsdtRewards} USDT</span>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('withdrawal')}
                  className="w-full py-2.5 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  Go to Withdrawal Section
                  <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                </button>
              </div>

              {/* QUICK TESTNET CONTROLS (Zero waiting mode) */}
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" />
                    Instant Demo Testing
                  </span>
                  <span className="text-[10px] text-amber-300/80">0 Seconds Wait</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    disabled={isProcessing}
                    onClick={() => handleFastForwardAdsDays(10)}
                    className="py-2 px-1 text-[10px] font-bold rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-center transition-all disabled:opacity-50"
                  >
                    +10d ADS Yield
                  </button>
                  <button
                    disabled={isProcessing}
                    onClick={handleFastForwardUsdtCap}
                    className="py-2 px-1 text-[10px] font-bold rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-center transition-all disabled:opacity-50"
                  >
                    Hit USDT Cap
                  </button>
                  <button
                    disabled={isProcessing}
                    onClick={handleWithdrawPrincipal}
                    className="py-2 px-1 text-[10px] font-bold rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 text-center transition-all disabled:opacity-50"
                  >
                    Unlock Capital
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: STAKE FLOW (Image 1: Steps 5, 6, 7, 8 & Image 2: Steps 5, 6)*/}
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

              {/* ------------------------------------------------------------- */}
              {/* ADS MODULE STAKING (Exact steps from Image 1: Steps 5, 6, 7, 8) */}
              {/* ------------------------------------------------------------- */}
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

                  {/* STEP 5: Enter Stake Amount (Exact from Image 1) */}
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
                        <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[9px] font-black text-white">₮</span>
                        <span className="text-xs font-bold text-emerald-400">USDT</span>
                      </div>
                    </div>

                    {/* Quick Pick Chips */}
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

                  {/* STEP 6: Choose Staking Period (Exact from Image 1) */}
                  <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-pink-600 text-[10px] font-black flex items-center justify-center text-white">6</span>
                      Choose Staking Period
                    </label>

                    <div className="space-y-2">
                      {[
                        { days: 0, label: 'Flexible Period', roi: '0.2% daily' },
                        { days: 30, label: '30 Days', roi: '0.4% daily' },
                        { days: 90, label: '90 Days', roi: '0.6% daily' },
                        { days: 180, label: '180 Days', roi: '0.8% daily' },
                        { days: 360, label: '360 Days', roi: '1% daily', popular: true },
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
                            <span className="text-xs font-bold">{item.label}</span>
                            {item.popular && (
                              <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-bold px-1.5 py-0.2 rounded border border-emerald-500/30">
                                Best Yield
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-black text-blue-400">{item.roi}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* STEP 7: ADS Quantity Calculation (Exact from Image 1) */}
                  <div className="bg-[#141b27] border border-emerald-500/30 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-[10px] font-black flex items-center justify-center text-white">7</span>
                        ADS Quantity Calculation
                      </span>
                      <span className="text-[10px] text-slate-400">Auto Market Calculation</span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#0e141f] border border-slate-800 space-y-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xs text-slate-400">Current ADS Price</span>
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
                        <span className="text-[10px] text-slate-500 block mt-0.5">Based on market price ($1000 USDT = 2,000 ADS)</span>
                      </div>
                    </div>
                  </div>

                  {/* STEP 8: System Buy ADS & Start Staking (Exact from Image 1) */}
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
                      After confirmation, the system will purchase ADS tokens from the market at <strong>$0.50</strong> using your staked USDT and automatically start your staking plan.
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

              {/* ------------------------------------------------------------- */}
              {/* USDT STAKING MODULE (Exact steps from Image 2: Steps 5, 6)    */}
              {/* ------------------------------------------------------------- */}
              {stakeMode === 'usdt' && (
                <div className="space-y-4">

                  {/* Top Header & Multiplier Cap Table (Exact from Image 2) */}
                  <div className="bg-gradient-to-r from-emerald-950/50 via-slate-900 to-amber-950/40 border border-emerald-500/40 p-3 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-black text-white flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-emerald-400" />
                        USDT STAKING MODULE
                      </h2>
                      <span className="text-xs font-black text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/40">
                        1% DAILY
                      </span>
                    </div>

                    {/* Return Multiplier Table from Image 2 */}
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

                  {/* STEP 5: Enter Staking Amount (Exact from Image 2) */}
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
                        <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[9px] font-black text-white">₮</span>
                        <span className="text-xs font-bold text-emerald-400">USDT</span>
                      </div>
                    </div>

                    {/* Applicable Plan Card (Step 5 in Image 2) */}
                    <div className="p-3 rounded-xl bg-[#0e141f] border border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Applicable Plan</span>
                        <span className="text-sm font-black text-amber-400">{usdtMultiplier} ({usdtPlanRange})</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Max Payout</span>
                        <span className="text-xs font-bold text-white">${usdtMaxReturn.toLocaleString()} USDT</span>
                      </div>
                    </div>
                  </div>

                  {/* STEP 6: ADS Token Allocation & Start Staking (Exact from Image 2) */}
                  <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-pink-600 text-[10px] font-black flex items-center justify-center text-white">6</span>
                        ADS Token Allocation
                      </span>
                      <span className="text-[10px] text-emerald-400 font-semibold">At Market Price</span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#0e141f] border border-slate-800 text-center space-y-2">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xs text-slate-400">Current ADS Price:</span>
                        <span className="text-xs font-black text-amber-300">$0.50</span>
                      </div>
                      <div className="flex justify-center text-slate-500">
                        <ArrowDown className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">ADS Tokens Allocated (At Market Price)</span>
                        <div className="text-xl font-black text-emerald-400">{(parsedUsdtDeposit * 2).toLocaleString()} ADS</div>
                        <span className="text-[9px] text-slate-500 block mt-0.5">80% Buy-and-Burn • 20% Liquidity Support</span>
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
          {/* TAB 3: WITHDRAWAL FLOW (Image 1: Steps 10, 11, 12, 13 & Image 2)  */}
          {/* ================================================================= */}
          {activeTab === 'withdrawal' && (
            <div className="space-y-4 animate-in fade-in duration-200">

              <div className="bg-gradient-to-r from-blue-900/40 to-slate-900 border border-blue-500/30 p-3 rounded-2xl flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    WITHDRAWAL SECTION
                  </h2>
                  <span className="text-[10px] text-slate-400">Select token & withdraw rewards to your wallet</span>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/40">
                  Step 10-12
                </span>
              </div>

              {/* STEP 11: Select Token & Withdraw (Exact from Image 1 & Image 2) */}
              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white block">Select Token</label>
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
                      <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-black text-white">₮</div>
                      <div className="text-left">
                        <span className="text-xs font-bold block">USDT</span>
                        <span className="text-[9px] text-slate-400">Tether USD</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Available Balance Display */}
                <div className="p-3 rounded-xl bg-[#0e141f] border border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Available Reward Balance</span>
                  <span className="text-sm font-black text-white">
                    {withdrawToken === 'ADS' ? `${pendingAdsRewards} ADS` : `$${pendingUsdtRewards} USDT`}
                  </span>
                </div>

                {/* 3% Base Tax Breakdown (Whitepaper Page 12) */}
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-slate-400">
                    <span>Base Selling / Withdrawal Tax</span>
                    <span className="font-bold text-amber-400">3% (to Treasury)</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Net Received in Wallet</span>
                    <span className="font-bold text-emerald-400">97%</span>
                  </div>
                </div>

                {/* Big Blue Button: "Withdraw" (Exact from Image 1 & 2) */}
                <button
                  disabled={isProcessing || (withdrawToken === 'ADS' ? parseFloat(pendingAdsRewards) <= 0 : parseFloat(pendingUsdtRewards) <= 0)}
                  onClick={handleWithdrawal}
                  className="w-full py-3.5 rounded-xl font-black bg-blue-600 hover:bg-blue-500 text-white text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      {processingStep || 'Processing on Blockchain...'}
                    </>
                  ) : (
                    'Withdraw'
                  )}
                </button>
              </div>

              {/* STEP 13: Maturity Payout (Exact from Image 1 Step 13) */}
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
                  After the selected staking period ends, the original capital amount of <strong>ADS tokens</strong> is unlocked and credited back to the user.
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
          {/* TAB 4: REFERRALS & TIERS (Section 5 & 10 of Whitepaper)           */}
          {/* ================================================================= */}
          {activeTab === 'referrals' && (
            <div className="space-y-4 animate-in fade-in duration-200">

              {/* Referral Link Box */}
              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-blue-400" />
                    Your Referral Link
                  </span>
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 font-bold px-2 py-0.5 rounded-full">
                    3-Level System
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-[#0e141f] border border-slate-800 p-2.5 rounded-xl">
                  <span className="text-[11px] font-mono text-slate-300 truncate flex-1">{referralUrl}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(referralUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* 3-Level Commission Structure Cards */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[#141b27] border border-emerald-500/30 p-3 rounded-2xl">
                  <span className="text-[9px] font-bold text-emerald-400 block mb-0.5">DIRECT (L1)</span>
                  <span className="text-xl font-black text-white">10%</span>
                  <span className="text-[9px] text-slate-500 block mt-0.5">Direct Team</span>
                </div>
                <div className="bg-[#141b27] border border-blue-500/30 p-3 rounded-2xl">
                  <span className="text-[9px] font-bold text-blue-400 block mb-0.5">LEVEL 2</span>
                  <span className="text-xl font-black text-white">3%</span>
                  <span className="text-[9px] text-slate-500 block mt-0.5">2nd Downline</span>
                </div>
                <div className="bg-[#141b27] border border-amber-500/30 p-3 rounded-2xl">
                  <span className="text-[9px] font-bold text-amber-400 block mb-0.5">LEVEL 3</span>
                  <span className="text-xl font-black text-white">2%</span>
                  <span className="text-[9px] text-slate-500 block mt-0.5">3rd Downline</span>
                </div>
              </div>

              {/* Community Tiers (V1-V6) Differential Matrix */}
              <div className="bg-[#141b27] border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-400" />
                    Community Tier System (V1 – V6)
                  </span>
                  <span className="text-[10px] text-slate-400">Differential Overrides</span>
                </div>

                <div className="space-y-1.5">
                  {[
                    { tier: 'V1', bonus: '10%', stake: '100U', weak: '5,000U' },
                    { tier: 'V2', bonus: '20%', stake: '500U', weak: '20,000U' },
                    { tier: 'V3', bonus: '30%', stake: '1,000U', weak: '50,000U' },
                    { tier: 'V4', bonus: '35%', stake: '3,000U', weak: '150,000U' },
                    { tier: 'V5', bonus: '45%', stake: '5,000U', weak: '500,000U' },
                    { tier: 'V6', bonus: '55%', stake: '10,000U', weak: '2,000,000U' },
                  ].map((row) => (
                    <div key={row.tier} className="p-2 rounded-xl bg-[#0e141f] border border-slate-800/80 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 font-black text-[11px] flex items-center justify-center">
                          {row.tier}
                        </span>
                        <span className="text-slate-300 font-semibold">{row.stake} personal</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-500">Weak: {row.weak}</span>
                        <span className="text-xs font-black text-amber-400">{row.bonus}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 5: TEST TOOLS & SETTINGS (Clean panel for self-sufficiency)   */}
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
                  Add Tokens to MetaMask
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
                  Smart Contracts on BscScan
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
                    <span>Staking Vault</span>
                    <span className="text-blue-400">0x494f...133 ↗</span>
                  </a>
                </div>
              </div>

            </div>
          )}

        </main>

        {/* ================================================================= */}
        {/* FIXED BOTTOM NAVIGATION BAR (Matches Step 10 in Image 1 & Image 2)*/}
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

        {/* CONNECT WALLET MODAL (Step 3 in Image 1 & 2) */}
        {showWalletModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="w-full max-w-xs bg-[#141b27] border border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-white">Connect Wallet</h3>
                <button
                  onClick={() => setShowWalletModal(false)}
                  className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2">
                {[
                  { name: 'MetaMask', icon: '🦊', desc: 'Recommended Web3 Wallet' },
                  { name: 'Trust Wallet', icon: '🛡️', desc: 'Mobile Multi-chain' },
                  { name: 'WalletConnect', icon: '🔄', desc: 'QR Code Pairing' },
                  { name: 'Other Wallets', icon: '⋯', desc: 'Coinbase, OKX, etc.' },
                ].map((w) => (
                  <button
                    key={w.name}
                    onClick={() => handleConnectWallet(w.name)}
                    className="w-full p-3 rounded-2xl bg-[#0e141f] border border-slate-800 hover:border-blue-500/50 flex items-center justify-between transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{w.icon}</span>
                      <div className="text-left">
                        <span className="text-xs font-bold text-white block group-hover:text-blue-400 transition-colors">{w.name}</span>
                        <span className="text-[10px] text-slate-500">{w.desc}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
