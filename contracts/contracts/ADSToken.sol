// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IBEP20.sol";

interface IADSStakingVault {
    function isParticipant(address user) external view returns (bool);
    function userStakedADS(address user) external view returns (uint256);
}

/**
 * @title ADSToken (ADS) v2.0
 * @dev Implementation of the Adstoken fixed-supply BEP-20 token with:
 *      - 1,000,000,000 ADS fixed maximum supply (no minting after deployment)
 *      - Participant-Protected Trading Model (Whitepaper v2.0 Section 10)
 *      - Progressive LP-Impact Tax (Whitepaper v2.0 Section 11)
 *      - Sell tax routed to Ecosystem Treasury (Whitepaper v2.0 Section 7 & 8)
 */
contract ADSToken is IBEP20 {
    string public constant name = "Adstoken";
    string public constant symbol = "ADS";
    uint8 public constant decimals = 18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10**18; // 1 Billion ADS

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    address public owner;
    address public ecosystemTreasury;
    address public dexPair;
    address public stakingVault;

    // Rolling 24h sell tracking: user => date (timestamp / 1 days) => totalSold
    mapping(address => mapping(uint256 => uint256)) public dailySoldAmount;

    // Whitelist exemptions for internal protocol contracts (routers, vaults, treasury)
    mapping(address => bool) public isExcludedFromLimits;
    mapping(address => bool) public isExcludedFromTax;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TreasuryUpdated(address indexed newTreasury);
    event DexPairUpdated(address indexed newPair);
    event StakingVaultUpdated(address indexed newVault);
    event ExcludedFromLimits(address indexed account, bool isExcluded);
    event ExcludedFromTax(address indexed account, bool isExcluded);
    event SellTaxCharged(address indexed seller, uint256 taxAmount, uint256 taxBps);

    modifier onlyOwner() {
        require(msg.sender == owner, "ADS: caller is not the owner");
        _;
    }

    constructor(address _treasury) {
        require(_treasury != address(0), "ADS: treasury cannot be zero address");
        owner = msg.sender;
        ecosystemTreasury = _treasury;

        // Total fixed supply minted to deployer / allocation multisig
        _balances[msg.sender] = TOTAL_SUPPLY;
        emit Transfer(address(0), msg.sender, TOTAL_SUPPLY);

        isExcludedFromLimits[msg.sender] = true;
        isExcludedFromLimits[_treasury] = true;
        isExcludedFromLimits[address(this)] = true;

        isExcludedFromTax[msg.sender] = true;
        isExcludedFromTax[_treasury] = true;
        isExcludedFromTax[address(this)] = true;
    }

    function totalSupply() external pure override returns (uint256) {
        return TOTAL_SUPPLY;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function allowance(address tokenOwner, address spender) external view override returns (uint256) {
        return _allowances[tokenOwner][spender];
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external override returns (bool) {
        uint256 currentAllowance = _allowances[sender][msg.sender];
        require(currentAllowance >= amount, "ADS: transfer amount exceeds allowance");
        unchecked {
            _approve(sender, msg.sender, currentAllowance - amount);
        }
        _transfer(sender, recipient, amount);
        return true;
    }

    function _approve(address tokenOwner, address spender, uint256 amount) internal {
        require(tokenOwner != address(0), "ADS: approve from zero address");
        require(spender != address(0), "ADS: approve to zero address");
        _allowances[tokenOwner][spender] = amount;
        emit Approval(tokenOwner, spender, amount);
    }

    /**
     * @dev Calculates the sell tax percentage based on LP pool impact (Section 11):
     *      - <= 0.10% LP impact: 3% (300 bps)
     *      - 0.10% - 0.30% LP impact: 5% (500 bps)
     *      - 0.30% - 0.50% LP impact: 8% (800 bps)
     *      - > 0.50% LP impact: Rejected by ceiling rule!
     */
    function calculateSellTaxBps(uint256 sellAmount, uint256 lpReserve) public pure returns (uint256) {
        if (lpReserve == 0) {
            return 300; // Default base 3% if no LP reserve established yet
        }
        // Impact bps: (sellAmount * 10000) / lpReserve
        uint256 impactBps = (sellAmount * 10000) / lpReserve;

        if (impactBps <= 10) {
            return 300; // 3%
        } else if (impactBps <= 30) {
            return 500; // 5%
        } else {
            return 800; // 8%
        }
    }

    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "ADS: transfer from zero address");
        require(recipient != address(0), "ADS: transfer to zero address");
        require(_balances[sender] >= amount, "ADS: transfer amount exceeds balance");

        // Check if this transfer is a SELL to the DEX liquidity pool
        bool isSell = (dexPair != address(0) && recipient == dexPair);

        uint256 taxAmount = 0;

        if (isSell && !isExcludedFromLimits[sender]) {
            uint256 lpReserve = _balances[dexPair];
            
            // Pool-protection ceiling: Any sell must be <= 0.5% of the LP's ADS reserve (Section 10 & 11)
            if (lpReserve > 0) {
                uint256 maxAllowedLpSell = (lpReserve * 5) / 1000; // 0.5%
                require(amount <= maxAllowedLpSell, "ADS: Sell exceeds 0.5% LP reserve protection ceiling");
            }

            // Rolling 24h wallet sell allowance check
            uint256 currentDay = block.timestamp / 1 days;
            uint256 userTotalHolding = _balances[sender];
            if (stakingVault != address(0)) {
                userTotalHolding += IADSStakingVault(stakingVault).userStakedADS(sender);
            }

            bool participant = false;
            if (stakingVault != address(0)) {
                participant = IADSStakingVault(stakingVault).isParticipant(sender);
            }

            // Participant allowance: up to 10% per rolling 24h. Non-participant: up to 3%
            uint256 maxDailyPct = participant ? 10 : 3;
            uint256 maxDailySell = (userTotalHolding * maxDailyPct) / 100;
            
            require(
                dailySoldAmount[sender][currentDay] + amount <= maxDailySell,
                "ADS: Exceeds 24h rolling sell limit (10% participant / 3% non-participant)"
            );

            dailySoldAmount[sender][currentDay] += amount;

            // Progressive LP Impact Tax
            if (!isExcludedFromTax[sender]) {
                uint256 taxBps = calculateSellTaxBps(amount, lpReserve);
                taxAmount = (amount * taxBps) / 10000;
                emit SellTaxCharged(sender, taxAmount, taxBps);
            }
        }

        unchecked {
            _balances[sender] -= amount;
        }

        uint256 finalTransferAmount = amount - taxAmount;
        _balances[recipient] += finalTransferAmount;
        emit Transfer(sender, recipient, finalTransferAmount);

        if (taxAmount > 0) {
            _balances[ecosystemTreasury] += taxAmount;
            emit Transfer(sender, ecosystemTreasury, taxAmount);
        }
    }

    // --- Administrative Functions ---

    function setEcosystemTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "ADS: invalid address");
        ecosystemTreasury = _treasury;
        isExcludedFromLimits[_treasury] = true;
        isExcludedFromTax[_treasury] = true;
        emit TreasuryUpdated(_treasury);
    }

    function setDexPair(address _pair) external onlyOwner {
        dexPair = _pair;
        emit DexPairUpdated(_pair);
    }

    function setStakingVault(address _vault) external onlyOwner {
        stakingVault = _vault;
        isExcludedFromLimits[_vault] = true;
        isExcludedFromTax[_vault] = true;
        emit StakingVaultUpdated(_vault);
    }

    function setExcludedFromLimits(address account, bool excluded) external onlyOwner {
        isExcludedFromLimits[account] = excluded;
        emit ExcludedFromLimits(account, excluded);
    }

    function setExcludedFromTax(address account, bool excluded) external onlyOwner {
        isExcludedFromTax[account] = excluded;
        emit ExcludedFromTax(account, excluded);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ADS: new owner cannot be zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
