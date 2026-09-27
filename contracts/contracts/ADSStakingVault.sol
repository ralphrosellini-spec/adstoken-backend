// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IBEP20.sol";

/**
 * @title ADSStakingVault v2.1
 * @dev Whitepaper v2.0 Architecture with Direct USDT Deposit & ADS-denominated Payouts:
 *      - Module 1: ADS Staking (Flexible, 30d, 90d, 180d, 360d)
 *        User deposits USDT directly → Vault locks ADS equivalent at current adsPrice ($0.50).
 *        No need to buy/swap ADS on DEX first.
 *        Daily rewards & principal return are ALWAYS paid in ADS tokens to the user's wallet!
 *      - Module 2: USDT Entry Staking (1% daily, 2x/2.5x/3x reward caps)
 *        User deposits USDT → 80% to Buy-Burn Treasury, 20% to Liquidity Support.
 *        Daily rewards (1%) are converted and paid in ADS tokens at current adsPrice to user's wallet!
 *      - 3% Base Withdrawal Tax routed to Ecosystem Treasury.
 *      - Admin-controlled ADS price (setAdsPrice) for price adjustments.
 */
contract ADSStakingVault {
    IBEP20 public immutable adsToken;
    IBEP20 public immutable usdtToken;

    address public owner;
    address public backendOperator;
    address public ecosystemTreasury;
    address public burnAddress = 0x000000000000000000000000000000000000dEaD;
    address public liquiditySupportWallet;

    uint256 public constant WITHDRAWAL_TAX_BPS = 300; // 3%
    uint256 public constant ADS_PRICE_DECIMALS = 1e18; // 18 decimal fixed point

    // Current ADS price in USDT (18 decimals). Default: $0.50 = 5e17 (1 USDT = 2 ADS)
    uint256 public adsPrice = 5e17;

    // Seconds per day — 86400 for mainnet, 60 for testnet
    uint256 public secondsPerDay = 86400;

    // ==============================================================================
    // MODULE 1: ADS STAKING PLANS
    // ==============================================================================
    struct AdsStake {
        uint256 stakeId;
        uint256 usdtDeposited;       // USDT amount deposited by user
        uint256 adsAmount;           // Tracked ADS principal locked (usdtDeposited * 1e18 / adsEntryPrice)
        uint256 adsEntryPrice;       // Price at stake time
        uint256 periodDays;          // 0 = Flexible, 30, 90, 180, 360
        uint256 dailyRoiBps;         // 20, 40, 60, 80, 100
        uint256 startTime;
        uint256 maturityTime;
        uint256 claimedRewards;      // ADS rewards claimed so far
        uint256 lastClaimTime;
        bool isMatured;
        bool principalWithdrawn;
    }

    // ==============================================================================
    // MODULE 2: USDT ENTRY STAKING PLANS
    // ==============================================================================
    struct UsdtStake {
        uint256 stakeId;
        uint256 amountUsdt;          // USDT deposited
        uint256 adsEntryPrice;       // Price at stake time
        uint256 startTime;
        uint256 maxRewardUsdt;       // 2x, 2.5x, or 3x cap in USDT value
        uint256 claimedRewardsUsdt;  // cumulative USDT-equivalent claimed
        uint256 claimedRewardsAds;   // total ADS sent to user
        uint256 lastClaimTime;
        bool isCompleted;
    }

    // User address => ADS stakes
    mapping(address => AdsStake[]) public userAdsStakes;
    mapping(address => uint256) public userStakedADS;           // Tracked active ADS principal
    mapping(address => uint256) public userStakedUsdtForAds;    // USDT deposited for ADS staking
    mapping(address => uint256) public userFirstStakeTime;

    // User address => USDT Entry stakes
    mapping(address => UsdtStake[]) public userUsdtStakes;
    mapping(address => uint256) public userTotalStakedUsdt;     // Module 2 USDT staked

    // Global Stats
    uint256 public totalAdsStaked;           // Total active ADS principal tracked
    uint256 public totalUsdtForAdsStaked;    // Total USDT deposited into Module 1
    uint256 public totalUsdtStaked;          // Total USDT deposited into Module 2
    uint256 public totalAdsRewardsPaid;      // Total ADS paid out as rewards
    uint256 public totalUsdtRewardsPaid;     // Total USDT paid out as rewards
    uint256 public totalUsdtSentToBuyBurn;
    uint256 public totalUsdtSentToLiquidity;

    // Events
    event AdsStaked(address indexed user, uint256 indexed stakeId, uint256 usdtDeposited, uint256 adsAmount, uint256 periodDays, uint256 dailyRoiBps, uint256 adsEntryPrice);
    event UsdtStaked(address indexed user, uint256 indexed stakeId, uint256 amountUsdt, uint256 maxRewardCap, uint256 adsEntryPrice);
    event AdsRewardsClaimed(address indexed user, uint256 netAdsReward, uint256 taxAds);
    event UsdtRewardsClaimed(address indexed user, uint256 netReward, uint256 taxDeducted);
    event UsdtRewardsClaimedInAds(address indexed user, uint256 usdtEquivalent, uint256 netAdsReward, uint256 taxAds);
    event AdsPrincipalWithdrawn(address indexed user, uint256 indexed stakeId, uint256 netAdsPrincipal, uint256 usdtEquivalent);
    event AdsPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event TreasuryUpdated(address indexed newTreasury);
    event BackendOperatorUpdated(address indexed newBackend);
    event LiquidityWalletUpdated(address indexed newWallet);
    event SecondsPerDayUpdated(uint256 newSeconds);

    modifier onlyOwner() {
        require(msg.sender == owner, "Vault: not owner");
        _;
    }

    modifier onlyBackendOrOwner() {
        require(msg.sender == backendOperator || msg.sender == owner, "Vault: not authorized");
        _;
    }

    constructor(
        address _adsToken,
        address _usdtToken,
        address _treasury,
        address _backendOperator,
        address _liquiditySupportWallet,
        uint256 _secondsPerDay
    ) {
        require(_adsToken != address(0), "Invalid ADS address");
        require(_usdtToken != address(0), "Invalid USDT address");
        require(_treasury != address(0), "Invalid treasury address");

        adsToken = IBEP20(_adsToken);
        usdtToken = IBEP20(_usdtToken);
        ecosystemTreasury = _treasury;
        backendOperator = _backendOperator != address(0) ? _backendOperator : msg.sender;
        liquiditySupportWallet = _liquiditySupportWallet != address(0) ? _liquiditySupportWallet : _treasury;
        owner = msg.sender;
        secondsPerDay = _secondsPerDay > 0 ? _secondsPerDay : 86400;
    }

    // ==========================================
    // PRICE CONVERSION HELPERS
    // ==========================================

    function usdtToAds(uint256 usdtAmount) public view returns (uint256) {
        return (usdtAmount * ADS_PRICE_DECIMALS) / adsPrice;
    }

    function adsToUsdt(uint256 adsAmount) public view returns (uint256) {
        return (adsAmount * adsPrice) / ADS_PRICE_DECIMALS;
    }

    // ==========================================
    // MODULE 1: ADS STAKING (USDT Deposit → ADS Tracking & ADS Payout)
    // ==========================================

    function getRoiBpsForPeriod(uint256 periodDays) public pure returns (uint256) {
        if (periodDays == 0) return 20;       // Flexible: 0.20% daily
        if (periodDays == 30) return 40;      // 30 days:  0.40% daily
        if (periodDays == 90) return 60;      // 90 days:  0.60% daily
        if (periodDays == 180) return 80;     // 180 days: 0.80% daily
        if (periodDays == 360) return 100;    // 360 days: 1.00% daily
        revert("Vault: invalid staking period");
    }

    /**
     * @notice Stakes by depositing USDT directly.
     *         The vault records the ADS equivalent at the current ADS price ($0.50).
     *         No DEX swap required!
     *         Rewards and principal return are ALWAYS paid in ADS tokens to the user!
     */
    function stakeWithUsdt(uint256 usdtAmount, uint256 periodDays) public {
        require(usdtAmount > 0, "Vault: amount must be > 0");
        uint256 dailyRoiBps = getRoiBpsForPeriod(periodDays);

        require(usdtToken.transferFrom(msg.sender, address(this), usdtAmount), "Vault: USDT transfer failed");

        uint256 entryPrice = adsPrice;
        uint256 adsAmount = (usdtAmount * ADS_PRICE_DECIMALS) / entryPrice;
        require(adsAmount > 0, "Vault: ADS equivalent is zero");

        uint256 maturityTime = periodDays == 0 ? 0 : block.timestamp + (periodDays * secondsPerDay);
        uint256 stakeId = userAdsStakes[msg.sender].length;

        userAdsStakes[msg.sender].push(AdsStake({
            stakeId: stakeId,
            usdtDeposited: usdtAmount,
            adsAmount: adsAmount,
            adsEntryPrice: entryPrice,
            periodDays: periodDays,
            dailyRoiBps: dailyRoiBps,
            startTime: block.timestamp,
            maturityTime: maturityTime,
            claimedRewards: 0,
            lastClaimTime: block.timestamp,
            isMatured: false,
            principalWithdrawn: false
        }));

        userStakedADS[msg.sender] += adsAmount;
        userStakedUsdtForAds[msg.sender] += usdtAmount;
        totalAdsStaked += adsAmount;
        totalUsdtForAdsStaked += usdtAmount;

        if (userFirstStakeTime[msg.sender] == 0) {
            userFirstStakeTime[msg.sender] = block.timestamp;
        }

        emit AdsStaked(msg.sender, stakeId, usdtAmount, adsAmount, periodDays, dailyRoiBps, entryPrice);
    }

    /**
     * @notice Alternative: Stake directly with ADS tokens if user already holds ADS.
     */
    function stakeADS(uint256 amount, uint256 periodDays) external {
        require(amount > 0, "Vault: amount must be > 0");
        uint256 dailyRoiBps = getRoiBpsForPeriod(periodDays);

        require(adsToken.transferFrom(msg.sender, address(this), amount), "Vault: ADS transfer failed");

        uint256 entryPrice = adsPrice;
        uint256 usdtEquivalent = (amount * entryPrice) / ADS_PRICE_DECIMALS;
        uint256 maturityTime = periodDays == 0 ? 0 : block.timestamp + (periodDays * secondsPerDay);
        uint256 stakeId = userAdsStakes[msg.sender].length;

        userAdsStakes[msg.sender].push(AdsStake({
            stakeId: stakeId,
            usdtDeposited: usdtEquivalent,
            adsAmount: amount,
            adsEntryPrice: entryPrice,
            periodDays: periodDays,
            dailyRoiBps: dailyRoiBps,
            startTime: block.timestamp,
            maturityTime: maturityTime,
            claimedRewards: 0,
            lastClaimTime: block.timestamp,
            isMatured: false,
            principalWithdrawn: false
        }));

        userStakedADS[msg.sender] += amount;
        userStakedUsdtForAds[msg.sender] += usdtEquivalent;
        totalAdsStaked += amount;
        totalUsdtForAdsStaked += usdtEquivalent;

        if (userFirstStakeTime[msg.sender] == 0) {
            userFirstStakeTime[msg.sender] = block.timestamp;
        }

        emit AdsStaked(msg.sender, stakeId, usdtEquivalent, amount, periodDays, dailyRoiBps, entryPrice);
    }

    /**
     * @notice Calculates pending ADS rewards for a specific ADS stake.
     */
    function calculatePendingAdsReward(address user, uint256 stakeId) public view returns (uint256) {
        if (stakeId >= userAdsStakes[user].length) return 0;
        AdsStake memory st = userAdsStakes[user][stakeId];
        if (st.principalWithdrawn) return 0;

        uint256 endTime = block.timestamp;
        if (st.periodDays > 0 && endTime > st.maturityTime) {
            endTime = st.maturityTime;
        }

        if (endTime <= st.lastClaimTime) return 0;

        uint256 elapsedSeconds = endTime - st.lastClaimTime;
        uint256 completedDays = elapsedSeconds / secondsPerDay;
        if (completedDays == 0) return 0;

        uint256 dailyReward = (st.adsAmount * st.dailyRoiBps) / 10000;
        return dailyReward * completedDays;
    }

    /**
     * @notice Claims accumulated ADS staking rewards across all active stakes.
     *         3% fee is deducted to Ecosystem Treasury; remainder sent as ADS tokens to user!
     */
    function claimAdsRewards() external {
        uint256 totalPending = 0;
        uint256 length = userAdsStakes[msg.sender].length;

        for (uint256 i = 0; i < length; i++) {
            AdsStake storage st = userAdsStakes[msg.sender][i];
            if (st.principalWithdrawn) continue;

            uint256 pending = calculatePendingAdsReward(msg.sender, i);
            if (pending > 0) {
                totalPending += pending;
                st.claimedRewards += pending;
                uint256 completedDays = (block.timestamp - st.lastClaimTime) / secondsPerDay;
                st.lastClaimTime += completedDays * secondsPerDay;
                if (st.periodDays > 0 && block.timestamp >= st.maturityTime) {
                    st.isMatured = true;
                }
            }
        }

        require(totalPending > 0, "Vault: no pending ADS rewards");

        uint256 tax = (totalPending * WITHDRAWAL_TAX_BPS) / 10000;
        uint256 netAmount = totalPending - tax;

        totalAdsRewardsPaid += totalPending;

        require(adsToken.transfer(ecosystemTreasury, tax), "Vault: ADS tax transfer failed");
        require(adsToken.transfer(msg.sender, netAmount), "Vault: ADS reward transfer failed");

        emit AdsRewardsClaimed(msg.sender, netAmount, tax);
    }

    /**
     * @notice Withdraws ADS principal upon maturity or anytime (flexible).
     *         Payout is sent in ADS tokens to the user's wallet!
     */
    function withdrawAdsPrincipal(uint256 stakeId) external {
        require(stakeId < userAdsStakes[msg.sender].length, "Vault: invalid stakeId");
        AdsStake storage st = userAdsStakes[msg.sender][stakeId];
        require(!st.principalWithdrawn, "Vault: already withdrawn");

        if (st.periodDays > 0) {
            require(block.timestamp >= st.maturityTime, "Vault: stake has not matured yet");
        }

        // Pay out any remaining pending rewards first
        uint256 pending = calculatePendingAdsReward(msg.sender, stakeId);
        if (pending > 0) {
            st.claimedRewards += pending;
            uint256 completedDays = (block.timestamp - st.lastClaimTime) / secondsPerDay;
            st.lastClaimTime += completedDays * secondsPerDay;
            uint256 tax = (pending * WITHDRAWAL_TAX_BPS) / 10000;
            uint256 netReward = pending - tax;
            totalAdsRewardsPaid += pending;
            adsToken.transfer(ecosystemTreasury, tax);
            adsToken.transfer(msg.sender, netReward);
            emit AdsRewardsClaimed(msg.sender, netReward, tax);
        }

        st.principalWithdrawn = true;
        st.isMatured = true;
        userStakedADS[msg.sender] -= st.adsAmount;
        userStakedUsdtForAds[msg.sender] -= st.usdtDeposited;
        totalAdsStaked -= st.adsAmount;
        totalUsdtForAdsStaked -= st.usdtDeposited;

        // 3% withdrawal tax on principal (Page 6)
        uint256 principalTax = (st.adsAmount * WITHDRAWAL_TAX_BPS) / 10000;
        uint256 netPrincipal = st.adsAmount - principalTax;

        require(adsToken.transfer(ecosystemTreasury, principalTax), "Vault: ADS principal tax failed");
        require(adsToken.transfer(msg.sender, netPrincipal), "Vault: ADS principal return failed");

        emit AdsPrincipalWithdrawn(msg.sender, stakeId, netPrincipal, st.usdtDeposited);
    }

    // ==========================================
    // MODULE 2: USDT ENTRY STAKING (1% Daily, Payout in ADS Tokens)
    // ==========================================

    function getUsdtMultiplierCap(uint256 usdtAmount) public pure returns (uint256) {
        uint256 amountInUsd = usdtAmount / 10**18;
        if (amountInUsd < 10) revert("Vault: minimum deposit is 10 USDT");

        if (amountInUsd < 1000) {
            return (usdtAmount * 2);        // 2x
        } else if (amountInUsd < 5000) {
            return (usdtAmount * 25) / 10;  // 2.5x
        } else {
            return (usdtAmount * 3);        // 3x
        }
    }

    /**
     * @notice Stakes USDT in Module 2.
     *         80% to Buy-Burn Treasury, 20% to Liquidity Support.
     *         Rewards accrue at 1% daily in USDT value, but at withdrawal are paid in ADS tokens!
     */
    function stakeUSDT(uint256 amountUsdt) external {
        require(amountUsdt >= 10 * 10**18, "Vault: minimum 10 USDT required");

        uint256 maxCap = getUsdtMultiplierCap(amountUsdt);
        require(usdtToken.transferFrom(msg.sender, address(this), amountUsdt), "Vault: USDT transfer failed");

        uint256 buyBurnPortion = (amountUsdt * 80) / 100;
        uint256 liquidityPortion = amountUsdt - buyBurnPortion;

        totalUsdtSentToBuyBurn += buyBurnPortion;
        totalUsdtSentToLiquidity += liquidityPortion;

        usdtToken.transfer(ecosystemTreasury, buyBurnPortion);
        usdtToken.transfer(liquiditySupportWallet, liquidityPortion);

        uint256 stakeId = userUsdtStakes[msg.sender].length;
        userUsdtStakes[msg.sender].push(UsdtStake({
            stakeId: stakeId,
            amountUsdt: amountUsdt,
            adsEntryPrice: adsPrice,
            startTime: block.timestamp,
            maxRewardUsdt: maxCap,
            claimedRewardsUsdt: 0,
            claimedRewardsAds: 0,
            lastClaimTime: block.timestamp,
            isCompleted: false
        }));

        userTotalStakedUsdt[msg.sender] += amountUsdt;
        totalUsdtStaked += amountUsdt;

        emit UsdtStaked(msg.sender, stakeId, amountUsdt, maxCap, adsPrice);
    }

    /**
     * @notice Calculates pending USDT reward value for a USDT stake.
     */
    function calculatePendingUsdtReward(address user, uint256 stakeId) public view returns (uint256) {
        if (stakeId >= userUsdtStakes[user].length) return 0;
        UsdtStake memory st = userUsdtStakes[user][stakeId];
        if (st.isCompleted) return 0;

        uint256 elapsedSeconds = block.timestamp - st.lastClaimTime;
        uint256 completedDays = elapsedSeconds / secondsPerDay;
        if (completedDays == 0) return 0;

        uint256 dailyReward = (st.amountUsdt * 100) / 10000; // 1% daily
        uint256 rawPending = dailyReward * completedDays;

        uint256 remainingCap = st.maxRewardUsdt > st.claimedRewardsUsdt
            ? st.maxRewardUsdt - st.claimedRewardsUsdt
            : 0;
        return rawPending > remainingCap ? remainingCap : rawPending;
    }

    /**
     * @notice Calculates pending ADS reward for a USDT stake (converted at current market price).
     */
    function calculatePendingUsdtRewardInAds(address user, uint256 stakeId) public view returns (uint256) {
        uint256 pendingUsdt = calculatePendingUsdtReward(user, stakeId);
        if (pendingUsdt == 0) return 0;
        return (pendingUsdt * ADS_PRICE_DECIMALS) / adsPrice;
    }

    /**
     * @notice Claims USDT staking rewards converted and paid as ADS tokens into user's wallet!
     */
    function claimUsdtRewardsInAds() public {
        uint256 totalPendingUsdt = 0;
        uint256 length = userUsdtStakes[msg.sender].length;

        for (uint256 i = 0; i < length; i++) {
            UsdtStake storage st = userUsdtStakes[msg.sender][i];
            if (st.isCompleted) continue;

            uint256 pending = calculatePendingUsdtReward(msg.sender, i);
            if (pending > 0) {
                totalPendingUsdt += pending;
                st.claimedRewardsUsdt += pending;
                uint256 completedDays = (block.timestamp - st.lastClaimTime) / secondsPerDay;
                st.lastClaimTime += completedDays * secondsPerDay;
                if (st.claimedRewardsUsdt >= st.maxRewardUsdt) {
                    st.isCompleted = true;
                }
            }
        }

        require(totalPendingUsdt > 0, "Vault: no pending USDT rewards");

        // Convert USDT reward to ADS at current market price
        uint256 totalAdsToSend = (totalPendingUsdt * ADS_PRICE_DECIMALS) / adsPrice;
        uint256 tax = (totalAdsToSend * WITHDRAWAL_TAX_BPS) / 10000;
        uint256 netAds = totalAdsToSend - tax;

        totalAdsRewardsPaid += totalAdsToSend;

        require(adsToken.transfer(ecosystemTreasury, tax), "Vault: ADS tax transfer failed");
        require(adsToken.transfer(msg.sender, netAds), "Vault: ADS reward transfer failed");

        emit UsdtRewardsClaimedInAds(msg.sender, totalPendingUsdt, netAds, tax);
    }

    /**
     * @notice Claims USDT staking rewards. Paid in USDT tokens!
     *         3% tax is routed to Ecosystem Treasury, 97% net USDT sent to user wallet.
     */
    function claimUsdtRewards() public {
        uint256 totalPendingUsdt = 0;
        uint256 length = userUsdtStakes[msg.sender].length;

        for (uint256 i = 0; i < length; i++) {
            UsdtStake storage st = userUsdtStakes[msg.sender][i];
            if (st.isCompleted) continue;

            uint256 pending = calculatePendingUsdtReward(msg.sender, i);
            if (pending > 0) {
                totalPendingUsdt += pending;
                st.claimedRewardsUsdt += pending;
                uint256 completedDays = (block.timestamp - st.lastClaimTime) / secondsPerDay;
                st.lastClaimTime += completedDays * secondsPerDay;
                if (st.claimedRewardsUsdt >= st.maxRewardUsdt) {
                    st.isCompleted = true;
                }
            }
        }

        require(totalPendingUsdt > 0, "Vault: no pending USDT rewards");

        uint256 tax = (totalPendingUsdt * WITHDRAWAL_TAX_BPS) / 10000;
        uint256 netUsdt = totalPendingUsdt - tax;

        totalUsdtRewardsPaid += totalPendingUsdt;

        require(usdtToken.transfer(ecosystemTreasury, tax), "Vault: USDT tax transfer failed");
        require(usdtToken.transfer(msg.sender, netUsdt), "Vault: USDT reward transfer failed");

        emit UsdtRewardsClaimed(msg.sender, netUsdt, tax);
    }

    // ==========================================
    // BACKEND WITHDRAWAL PROCESS
    // ==========================================

    function backendProcessWithdrawal(address recipient, uint256 adsAmount) external onlyBackendOrOwner {
        require(recipient != address(0), "Vault: invalid recipient");
        require(adsAmount > 0, "Vault: amount > 0");

        uint256 tax = (adsAmount * WITHDRAWAL_TAX_BPS) / 10000;
        uint256 netAmount = adsAmount - tax;

        require(adsToken.transfer(ecosystemTreasury, tax), "Vault: ADS tax transfer failed");
        require(adsToken.transfer(recipient, netAmount), "Vault: ADS transfer failed");

        totalAdsRewardsPaid += adsAmount;
        emit AdsRewardsClaimed(recipient, netAmount, tax);
    }

    // ==========================================
    // PARTICIPANT QUALIFICATION
    // ==========================================

    function isParticipant(address user) external view returns (bool) {
        uint256 staked = userStakedADS[user] + userTotalStakedUsdt[user];
        if (staked == 0) return false;
        if (userFirstStakeTime[user] == 0) return false;
        if ((block.timestamp - userFirstStakeTime[user]) < 7 days) return false;
        return true;
    }

    // ==========================================
    // VIEW HELPERS
    // ==========================================

    function getUserAdsStakesCount(address user) external view returns (uint256) {
        return userAdsStakes[user].length;
    }

    function getUserUsdtStakesCount(address user) external view returns (uint256) {
        return userUsdtStakes[user].length;
    }

    function getTotalPendingAdsRewards(address user) external view returns (uint256) {
        uint256 total = 0;
        uint256 length = userAdsStakes[user].length;
        for (uint256 i = 0; i < length; i++) {
            total += calculatePendingAdsReward(user, i);
        }
        return total;
    }

    function getTotalPendingUsdtStakeRewardsInAds(address user) external view returns (uint256) {
        uint256 total = 0;
        uint256 length = userUsdtStakes[user].length;
        for (uint256 i = 0; i < length; i++) {
            total += calculatePendingUsdtRewardInAds(user, i);
        }
        return total;
    }

    // ==========================================
    // ADMIN FUNCTIONS
    // ==========================================

    function setAdsPrice(uint256 newPrice) external onlyBackendOrOwner {
        require(newPrice > 0, "Vault: price must be > 0");
        uint256 oldPrice = adsPrice;
        adsPrice = newPrice;
        emit AdsPriceUpdated(oldPrice, newPrice);
    }

    function setProductionMode() external onlyOwner {
        secondsPerDay = 1 days;
        emit SecondsPerDayUpdated(1 days);
    }

    function setSecondsPerDay(uint256 _seconds) external onlyOwner {
        require(_seconds > 0, "Vault: invalid seconds");
        secondsPerDay = _seconds;
        emit SecondsPerDayUpdated(_seconds);
    }

    function setBackendOperator(address _operator) external onlyOwner {
        require(_operator != address(0), "Invalid address");
        backendOperator = _operator;
        emit BackendOperatorUpdated(_operator);
    }

    function setEcosystemTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid address");
        ecosystemTreasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setLiquidityWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Invalid address");
        liquiditySupportWallet = _wallet;
        emit LiquidityWalletUpdated(_wallet);
    }
}
