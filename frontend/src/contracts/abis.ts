export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)"
];

export const MOCK_USDT_ABI = [
  ...ERC20_ABI,
  "function mint(address to, uint256 amount) external"
];

export const VAULT_ABI = [
  "function adsPrice() view returns (uint256)",
  "function usdtToAds(uint256 usdtAmount) view returns (uint256)",
  "function adsToUsdt(uint256 adsAmount) view returns (uint256)",
  "function stakeWithUsdt(uint256 usdtAmount, uint256 periodDays) external",
  "function stakeADS(uint256 amount, uint256 periodDays) external",
  "function stakeUSDT(uint256 amountUsdt) external",
  "function claimAdsRewards() external",
  "function claimUsdtRewards() external",
  "function claimUsdtRewardsInAds() external",
  "function withdrawAdsPrincipal(uint256 stakeId) external",
  "function calculatePendingAdsReward(address user, uint256 stakeId) view returns (uint256)",
  "function calculatePendingUsdtReward(address user, uint256 stakeId) view returns (uint256)",
  "function calculatePendingUsdtRewardInAds(address user, uint256 stakeId) view returns (uint256)",
  "function getTotalPendingAdsRewards(address user) view returns (uint256)",
  "function getTotalPendingUsdtStakeRewardsInAds(address user) view returns (uint256)",
  "function userStakedADS(address user) view returns (uint256)",
  "function userStakedUsdtForAds(address user) view returns (uint256)",
  "function userTotalStakedUsdt(address user) view returns (uint256)",
  "function isParticipant(address user) view returns (bool)",
  "function getUserAdsStakesCount(address user) view returns (uint256)",
  "function getUserUsdtStakesCount(address user) view returns (uint256)",
  "function userAdsStakes(address user, uint256 index) view returns (uint256 stakeId, uint256 usdtDeposited, uint256 adsAmount, uint256 adsEntryPrice, uint256 periodDays, uint256 dailyRoiBps, uint256 startTime, uint256 maturityTime, uint256 claimedRewards, uint256 lastClaimTime, bool isMatured, bool principalWithdrawn)",
  "function userUsdtStakes(address user, uint256 index) view returns (uint256 stakeId, uint256 amountUsdt, uint256 adsEntryPrice, uint256 startTime, uint256 maxRewardUsdt, uint256 claimedRewardsUsdt, uint256 claimedRewardsAds, uint256 lastClaimTime, bool isCompleted)",
  "function totalUsdtRewardsPaid() view returns (uint256)",
  "function setAdsPrice(uint256 newPrice) external",
  "function setProductionMode() external",
  "function setSecondsPerDay(uint256 _seconds) external",
  "event AdsStaked(address indexed user, uint256 indexed stakeId, uint256 usdtDeposited, uint256 adsAmount, uint256 periodDays, uint256 dailyRoiBps, uint256 adsEntryPrice)",
  "event UsdtStaked(address indexed user, uint256 indexed stakeId, uint256 amountUsdt, uint256 maxRewardCap, uint256 adsEntryPrice)",
  "event AdsRewardsClaimed(address indexed user, uint256 netReward, uint256 taxDeducted)",
  "event UsdtRewardsClaimed(address indexed user, uint256 netReward, uint256 taxDeducted)",
  "event UsdtRewardsClaimedInAds(address indexed user, uint256 usdtEquivalent, uint256 netAdsReward, uint256 taxAds)",
  "event AdsPrincipalWithdrawn(address indexed user, uint256 indexed stakeId, uint256 netAdsPrincipal, uint256 usdtEquivalent)"
];

export const SWAP_ABI = [
  "function swapUSDTForADS(uint256 usdtAmount) external",
  "function swapADSForUSDT(uint256 adsAmount) external",
  "function getEstimatedADS(uint256 usdtAmount) view returns (uint256)",
  "function getEstimatedUSDT(uint256 adsAmount) view returns (uint256 grossUsdt, uint256 taxUsdt, uint256 netUsdt)",
  "function ADS_PER_USDT() view returns (uint256)",
  "function SELL_TAX_BPS() view returns (uint256)",
  "event SwappedUSDTForADS(address indexed user, uint256 usdtIn, uint256 adsOut)",
  "event SwappedADSForUSDT(address indexed user, uint256 adsIn, uint256 usdtOut, uint256 taxPaid)"
];
