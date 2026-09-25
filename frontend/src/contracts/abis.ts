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

export const VAULT_ABI = [
  "function stakeADS(uint256 amount, uint256 periodDays) external",
  "function stakeUSDT(uint256 amountUsdt) external",
  "function claimAdsRewards() external",
  "function claimUsdtRewards() external",
  "function withdrawAdsPrincipal(uint256 stakeId) external",
  "function calculatePendingAdsReward(address user, uint256 stakeId) view returns (uint256)",
  "function calculatePendingUsdtReward(address user, uint256 stakeId) view returns (uint256)",
  "function userStakedADS(address user) view returns (uint256)",
  "function userTotalStakedUsdt(address user) view returns (uint256)",
  "function isParticipant(address user) view returns (bool)",
  "function getUserAdsStakesCount(address user) view returns (uint256)",
  "function getUserUsdtStakesCount(address user) view returns (uint256)",
  "function totalAdsStaked() view returns (uint256)",
  "function totalUsdtStaked() view returns (uint256)",
  "function totalAdsRewardsPaid() view returns (uint256)",
  "function totalUsdtRewardsPaid() view returns (uint256)",
  "function totalUsdtSentToBuyBurn() view returns (uint256)",
  "function totalUsdtSentToLiquidity() view returns (uint256)",
  "event AdsStaked(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 periodDays, uint256 dailyRoiBps)",
  "event UsdtStaked(address indexed user, uint256 indexed stakeId, uint256 amountUsdt, uint256 maxRewardCap)",
  "event AdsRewardsClaimed(address indexed user, uint256 netReward, uint256 taxDeducted)",
  "event UsdtRewardsClaimed(address indexed user, uint256 netReward, uint256 taxDeducted)"
];
