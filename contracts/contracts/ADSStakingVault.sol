// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IBEP20.sol";

/**
 * @title ADSStakingVault
 * @dev Implements Whitepaper v2.0 Two-Module Staking Architecture:
 *      - Module 1: ADS Staking (Flexible, 30d, 90d, 180d, 360d)
 *      - Module 2: USDT Entry Staking (1% daily, 2x / 2.5x / 3x reward caps, 80/20 buyback & LP distribution)
 *      - Participant status verification (50% staked for >= 7 days)
 *      - 3% base withdrawal tax routed to Ecosystem Treasury
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
    uint256 public constant SECONDS_PER_DAY = 1 days;

    // Module 1: ADS Staking Plans
    // Period: 0 = Flexible, 30 = 30 days, 90 = 90 days, 180 = 180 days, 360 = 360 days
    // Daily ROI in Basis Points: Flexible=20 (0.2%), 30d=40 (0.4%), 90d=60 (0.6%), 180d=80 (0.8%), 360d=100 (1.0%)
    struct AdsStake {
        uint256 stakeId;
        uint256 amount;
        uint256 periodDays;
        uint256 dailyRoiBps;
        uint256 startTime;
        uint256 maturityTime;
        uint256 claimedRewards;
        uint256 lastClaimTime;
        bool isMatured;
        bool principalWithdrawn;
    }

    // Module 2: USDT Staking
    struct UsdtStake {
        uint256 stakeId;
        uint256 amountUsdt;
        uint256 startTime;
        uint256 maxRewardUsdt; // 2x, 2.5x, or 3x based on deposit amount
        uint256 claimedRewardsUsdt;
        uint256 lastClaimTime;
        bool isCompleted;
    }

    // User address => List of ADS stakes
    mapping(address => AdsStake[]) public userAdsStakes;
    // User address => Total currently staked ADS (active principal)
    mapping(address => uint256) public userStakedADS;
    // User address => Earliest active stake start time
    mapping(address => uint256) public userFirstStakeTime;

    // User address => List of USDT stakes
    mapping(address => UsdtStake[]) public userUsdtStakes;
    mapping(address => uint256) public userTotalStakedUsdt;

    // Global Stats
    uint256 public totalAdsStaked;
    uint256 public totalUsdtStaked;
    uint256 public totalAdsRewardsPaid;
    uint256 public totalUsdtRewardsPaid;
    uint256 public totalUsdtSentToBuyBurn;
    uint256 public totalUsdtSentToLiquidity;

    // Events
    event AdsStaked(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 periodDays, uint256 dailyRoiBps);
    event UsdtStaked(address indexed user, uint256 indexed stakeId, uint256 amountUsdt, uint256 maxRewardCap);
    event AdsRewardsClaimed(address indexed user, uint256 netReward, uint256 taxDeducted);
    event UsdtRewardsClaimed(address indexed user, uint256 netReward, uint256 taxDeducted);
    event AdsPrincipalWithdrawn(address indexed user, uint256 indexed stakeId, uint256 amount);
    event TreasuryUpdated(address indexed newTreasury);
    event BackendOperatorUpdated(address indexed newBackend);
    event LiquidityWalletUpdated(address indexed newWallet);

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
        address _liquiditySupportWallet
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
    }

    // ==========================================
    // MODULE 1: ADS STAKING
    // ==========================================

    function getRoiBpsForPeriod(uint256 periodDays) public pure returns (uint256) {
        if (periodDays == 0) return 20;       // Flexible: 0.20% daily
        if (periodDays == 30) return 40;     // 30 days:  0.40% daily
        if (periodDays == 90) return 60;     // 90 days:  0.60% daily
        if (periodDays == 180) return 80;    // 180 days: 0.80% daily
        if (periodDays == 360) return 100;   // 360 days: 1.00% daily
        revert("Vault: invalid staking period");
    }

    /**
     * @notice Stakes ADS tokens for protocol rewards.
     * @param amount Amount of ADS to stake.
     * @param periodDays Lock period (0 for flexible, 30, 90, 180, 360).
     */
    function stakeADS(uint256 amount, uint256 periodDays) external {
        require(amount > 0, "Vault: amount must be > 0");
        uint256 dailyRoiBps = getRoiBpsForPeriod(periodDays);

        require(adsToken.transferFrom(msg.sender, address(this), amount), "Vault: transfer failed");

        uint256 maturityTime = periodDays == 0 ? 0 : block.timestamp + (periodDays * SECONDS_PER_DAY);
        uint256 stakeId = userAdsStakes[msg.sender].length;

        userAdsStakes[msg.sender].push(AdsStake({
            stakeId: stakeId,
            amount: amount,
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
        totalAdsStaked += amount;

        if (userFirstStakeTime[msg.sender] == 0) {
            userFirstStakeTime[msg.sender] = block.timestamp;
        }

        emit AdsStaked(msg.sender, stakeId, amount, periodDays, dailyRoiBps);
    }

    /**
     * @notice Calculates pending rewards for a specific ADS stake.
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
        // daily reward = (amount * dailyRoiBps) / 10000
        // reward per second = (daily reward) / 86400
        uint256 dailyReward = (st.amount * st.dailyRoiBps) / 10000;
        uint256 pending = (dailyReward * elapsedSeconds) / SECONDS_PER_DAY;
        return pending;
    }

    /**
     * @notice Claims accumulated ADS staking rewards across all active stakes.
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
                st.lastClaimTime = block.timestamp;
                if (st.periodDays > 0 && block.timestamp >= st.maturityTime) {
                    st.isMatured = true;
                }
            }
        }

        require(totalPending > 0, "Vault: no pending ADS rewards");

        // 3% Sell / Withdrawal Tax routed to Ecosystem Treasury (Page 6 & 12)
        uint256 tax = (totalPending * WITHDRAWAL_TAX_BPS) / 10000;
        uint256 netAmount = totalPending - tax;

        totalAdsRewardsPaid += totalPending;

        require(adsToken.transfer(ecosystemTreasury, tax), "Vault: tax transfer failed");
        require(adsToken.transfer(msg.sender, netAmount), "Vault: reward transfer failed");

        emit AdsRewardsClaimed(msg.sender, netAmount, tax);
    }

    /**
     * @notice Withdraws ADS principal upon maturity or for flexible staking.
     */
    function withdrawAdsPrincipal(uint256 stakeId) external {
        require(stakeId < userAdsStakes[msg.sender].length, "Vault: invalid stakeId");
        AdsStake storage st = userAdsStakes[msg.sender][stakeId];
        require(!st.principalWithdrawn, "Vault: already withdrawn");

        if (st.periodDays > 0) {
            require(block.timestamp >= st.maturityTime, "Vault: stake has not matured yet");
        }

        // Claim any remaining rewards before principal withdrawal
        uint256 pending = calculatePendingAdsReward(msg.sender, stakeId);
        if (pending > 0) {
            st.claimedRewards += pending;
            st.lastClaimTime = block.timestamp;
            uint256 tax = (pending * WITHDRAWAL_TAX_BPS) / 10000;
            uint256 netReward = pending - tax;
            totalAdsRewardsPaid += pending;
            adsToken.transfer(ecosystemTreasury, tax);
            adsToken.transfer(msg.sender, netReward);
            emit AdsRewardsClaimed(msg.sender, netReward, tax);
        }

        st.principalWithdrawn = true;
        st.isMatured = true;
        userStakedADS[msg.sender] -= st.amount;
        totalAdsStaked -= st.amount;

        // Original principal returned upon maturity (Page 6)
        require(adsToken.transfer(msg.sender, st.amount), "Vault: principal return failed");
        emit AdsPrincipalWithdrawn(msg.sender, stakeId, st.amount);
    }

    // ==========================================
    // MODULE 2: USDT ENTRY STAKING
    // ==========================================

    /**
     * @dev Calculates multiplier capping based on deposit amount (Section 5, Module 2):
     *      - $10 - $999: 2.0x (200%)
     *      - $1,000 - $4,999: 2.5x (250%)
     *      - >= $5,000: 3.0x (300%)
     */
    function getUsdtMultiplierCap(uint256 usdtAmount) public pure returns (uint256) {
        // USDT has 18 decimals in standard BSC testnet/mainnet BEP20 USDT
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
     * @notice Stakes USDT into the ecosystem.
     *         80% is allocated to market buy ADS and burn.
     *         20% is allocated to liquidity support.
     */
    function stakeUSDT(uint256 amountUsdt) external {
        require(amountUsdt >= 10 * 10**18, "Vault: minimum 10 USDT required");

        uint256 maxCap = getUsdtMultiplierCap(amountUsdt);
        require(usdtToken.transferFrom(msg.sender, address(this), amountUsdt), "Vault: USDT transfer failed");

        // 80% to Buy & Burn reserve / wallet
        uint256 buyBurnPortion = (amountUsdt * 80) / 100;
        // 20% to Liquidity Support wallet
        uint256 liquidityPortion = amountUsdt - buyBurnPortion;

        totalUsdtSentToBuyBurn += buyBurnPortion;
        totalUsdtSentToLiquidity += liquidityPortion;

        usdtToken.transfer(ecosystemTreasury, buyBurnPortion);
        usdtToken.transfer(liquiditySupportWallet, liquidityPortion);

        uint256 stakeId = userUsdtStakes[msg.sender].length;
        userUsdtStakes[msg.sender].push(UsdtStake({
            stakeId: stakeId,
            amountUsdt: amountUsdt,
            startTime: block.timestamp,
            maxRewardUsdt: maxCap,
            claimedRewardsUsdt: 0,
            lastClaimTime: block.timestamp,
            isCompleted: false
        }));

        userTotalStakedUsdt[msg.sender] += amountUsdt;
        totalUsdtStaked += amountUsdt;

        emit UsdtStaked(msg.sender, stakeId, amountUsdt, maxCap);
    }

    /**
     * @notice Pending 1% daily USDT rewards calculated up to the capping limit.
     */
    function calculatePendingUsdtReward(address user, uint256 stakeId) public view returns (uint256) {
        if (stakeId >= userUsdtStakes[user].length) return 0;
        UsdtStake memory st = userUsdtStakes[user][stakeId];
        if (st.isCompleted) return 0;

        uint256 elapsedSeconds = block.timestamp - st.lastClaimTime;
        // 1% daily = (amount * 100) / 10000
        uint256 dailyReward = (st.amountUsdt * 100) / 10000;
        uint256 rawPending = (dailyReward * elapsedSeconds) / SECONDS_PER_DAY;

        // Ensure does not exceed max capping
        uint256 remainingCap = st.maxRewardUsdt > st.claimedRewardsUsdt ? st.maxRewardUsdt - st.claimedRewardsUsdt : 0;
        return rawPending > remainingCap ? remainingCap : rawPending;
    }

    /**
     * @notice Claims USDT rewards with 3% sell tax deducted (Page 7).
     */
    function claimUsdtRewards() external {
        uint256 totalPending = 0;
        uint256 length = userUsdtStakes[msg.sender].length;

        for (uint256 i = 0; i < length; i++) {
            UsdtStake storage st = userUsdtStakes[msg.sender][i];
            if (st.isCompleted) continue;

            uint256 pending = calculatePendingUsdtReward(msg.sender, i);
            if (pending > 0) {
                totalPending += pending;
                st.claimedRewardsUsdt += pending;
                st.lastClaimTime = block.timestamp;
                if (st.claimedRewardsUsdt >= st.maxRewardUsdt) {
                    st.isCompleted = true;
                }
            }
        }

        require(totalPending > 0, "Vault: no pending USDT rewards");

        uint256 tax = (totalPending * WITHDRAWAL_TAX_BPS) / 10000;
        uint256 netReward = totalPending - tax;

        totalUsdtRewardsPaid += totalPending;

        require(usdtToken.transfer(ecosystemTreasury, tax), "Vault: tax transfer failed");
        require(usdtToken.transfer(msg.sender, netReward), "Vault: USDT reward transfer failed");

        emit UsdtRewardsClaimed(msg.sender, netReward, tax);
    }

    /**
     * @notice Backend or owner can execute processed withdrawals (Page 6, 7 & 8 Step 12).
     */
    function backendProcessWithdrawal(address recipient, uint256 tokenType, uint256 amount) external onlyBackendOrOwner {
        require(recipient != address(0), "Vault: invalid recipient");
        require(amount > 0, "Vault: amount > 0");

        uint256 tax = (amount * WITHDRAWAL_TAX_BPS) / 10000;
        uint256 netAmount = amount - tax;

        if (tokenType == 1) { // ADS Token
            require(adsToken.transfer(ecosystemTreasury, tax), "Vault: ADS tax transfer failed");
            require(adsToken.transfer(recipient, netAmount), "Vault: ADS transfer failed");
            emit AdsRewardsClaimed(recipient, netAmount, tax);
        } else if (tokenType == 2) { // USDT
            require(usdtToken.transfer(ecosystemTreasury, tax), "Vault: USDT tax transfer failed");
            require(usdtToken.transfer(recipient, netAmount), "Vault: USDT transfer failed");
            emit UsdtRewardsClaimed(recipient, netAmount, tax);
        } else {
            revert("Vault: invalid token type");
        }
    }

    // ==========================================
    // PARTICIPANT QUALIFICATION (Page 15)
    // ==========================================

    /**
     * @notice Checks if account qualifies for Participant treatment:
     *         - At least 50% of eligible ADS holdings staked
     *         - Staked for at least 7 days
     */
    function isParticipant(address user) external view returns (bool) {
        uint256 staked = userStakedADS[user];
        if (staked == 0) return false;

        uint256 walletBalance = adsToken.balanceOf(user);
        uint256 totalHoldings = walletBalance + staked;

        // Condition 1: At least 50% staked
        if ((staked * 100) / totalHoldings < 50) {
            return false;
        }

        // Condition 2: Staked for at least 7 days
        if (userFirstStakeTime[user] == 0 || (block.timestamp - userFirstStakeTime[user]) < 7 days) {
            return false;
        }

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

    // ==========================================
    // ADMIN FUNCTIONS
    // ==========================================

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
