// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IBEP20.sol";

/**
 * @title ADSSwap
 * @dev Demo DEX & Swap Portal for ADSToken v2.0
 *      - Implements 1:2 Swap Ratio (1 USDT = 2 ADS tokens, Price: $0.50 per ADS)
 *      - Matches Whitepaper v2.0 Page 6 & 7 price model ($0.50 / ADS)
 *      - Deducts 3% sell tax on ADS -> USDT reverse swap to Treasury
 *      - Allows testing users to mint USDT and swap for ADS seamlessly
 */
contract ADSSwap {
    IBEP20 public immutable adsToken;
    IBEP20 public immutable usdtToken;

    address public owner;
    address public ecosystemTreasury;

    // Rate: 1 USDT = 2 ADS (i.e. 1 ADS = $0.50 USDT)
    uint256 public constant ADS_PER_USDT = 2;
    uint256 public constant SELL_TAX_BPS = 300; // 3%

    event SwappedUSDTForADS(address indexed user, uint256 usdtIn, uint256 adsOut);
    event SwappedADSForUSDT(address indexed user, uint256 adsIn, uint256 usdtOut, uint256 taxPaid);
    event TreasuryUpdated(address indexed newTreasury);
    event EmergencyWithdraw(address indexed token, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Swap: not owner");
        _;
    }

    constructor(address _adsToken, address _usdtToken, address _treasury) {
        require(_adsToken != address(0), "Invalid ADS address");
        require(_usdtToken != address(0), "Invalid USDT address");
        require(_treasury != address(0), "Invalid treasury address");

        adsToken = IBEP20(_adsToken);
        usdtToken = IBEP20(_usdtToken);
        ecosystemTreasury = _treasury;
        owner = msg.sender;
    }

    /**
     * @notice Swap USDT for ADS at 1:2 ratio (1 USDT = 2 ADS).
     * @param usdtAmount Amount of USDT to spend.
     */
    function swapUSDTForADS(uint256 usdtAmount) external {
        require(usdtAmount > 0, "Swap: amount must be > 0");

        uint256 adsAmount = usdtAmount * ADS_PER_USDT;
        require(adsToken.balanceOf(address(this)) >= adsAmount, "Swap: insufficient ADS reserve in swap contract");

        // Transfer USDT from user to Swap / Treasury
        require(usdtToken.transferFrom(msg.sender, address(this), usdtAmount), "Swap: USDT transfer failed");

        // Send 2X ADS to user
        require(adsToken.transfer(msg.sender, adsAmount), "Swap: ADS transfer failed");

        emit SwappedUSDTForADS(msg.sender, usdtAmount, adsAmount);
    }

    /**
     * @notice Swap ADS back to USDT (1 ADS = 0.5 USDT, with 3% sell tax to Treasury).
     * @param adsAmount Amount of ADS to sell.
     */
    function swapADSForUSDT(uint256 adsAmount) external {
        require(adsAmount >= 2, "Swap: amount must be >= 2 ADS");

        uint256 grossUsdt = adsAmount / ADS_PER_USDT;
        uint256 tax = (grossUsdt * SELL_TAX_BPS) / 10000; // 3%
        uint256 netUsdt = grossUsdt - tax;

        require(usdtToken.balanceOf(address(this)) >= grossUsdt, "Swap: insufficient USDT in swap contract");

        // Transfer ADS from user to this contract
        require(adsToken.transferFrom(msg.sender, address(this), adsAmount), "Swap: ADS transfer failed");

        // Route 3% tax to Treasury
        if (tax > 0) {
            require(usdtToken.transfer(ecosystemTreasury, tax), "Swap: tax transfer failed");
        }

        // Send 97% net USDT to user
        require(usdtToken.transfer(msg.sender, netUsdt), "Swap: net USDT transfer failed");

        emit SwappedADSForUSDT(msg.sender, adsAmount, netUsdt, tax);
    }

    /**
     * @notice View function to get estimated ADS for given USDT amount.
     */
    function getEstimatedADS(uint256 usdtAmount) external pure returns (uint256) {
        return usdtAmount * ADS_PER_USDT;
    }

    /**
     * @notice View function to get estimated net USDT for given ADS amount.
     */
    function getEstimatedUSDT(uint256 adsAmount) external pure returns (uint256 grossUsdt, uint256 taxUsdt, uint256 netUsdt) {
        grossUsdt = adsAmount / ADS_PER_USDT;
        taxUsdt = (grossUsdt * SELL_TAX_BPS) / 10000;
        netUsdt = grossUsdt - taxUsdt;
    }

    // --- Admin Functions ---

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid address");
        ecosystemTreasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function emergencyWithdraw(address tokenAddress, uint256 amount) external onlyOwner {
        require(tokenAddress != address(0), "Invalid token address");
        IBEP20(tokenAddress).transfer(owner, amount);
        emit EmergencyWithdraw(tokenAddress, amount);
    }
}
