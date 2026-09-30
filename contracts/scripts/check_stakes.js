const { ethers } = require("ethers");

async function check() {
  const rpc = "https://data-seed-prebsc-1-s1.binance.org:8545";
  const provider = new ethers.JsonRpcProvider(rpc);
  const vaultAbi = [
    "function userStakedADS(address) view returns (uint256)",
    "function getUserAdsStakesCount(address) view returns (uint256)",
    "function userAdsStakes(address, uint256) view returns (uint256 stakeId, uint256 usdtDeposited, uint256 adsAmount, uint256 adsEntryPrice, uint256 periodDays, uint256 dailyRoiBps, uint256 startTime, uint256 maturityTime, uint256 claimedRewards, uint256 lastClaimTime, bool isMatured, bool principalWithdrawn)"
  ];
  const vault = new ethers.Contract("0x172736DFDDDAf7df5CB36CC219b3Edb2109bbEaA", vaultAbi, provider);

  const addr = "0x1E0D642D24Aa3cabb20724710F4DC20Dd03A7A96";
  const staked = await vault.userStakedADS(addr);
  const count = await vault.getUserAdsStakesCount(addr);
  console.log("On-chain userStakedADS:", ethers.formatEther(staked));
  console.log("ADS Stakes Count:", count.toString());
  for (let i = 0; i < Number(count); i++) {
    const st = await vault.userAdsStakes(addr, i);
    console.log(`Stake #${i}: adsAmount=${ethers.formatEther(st.adsAmount)}, principalWithdrawn=${st.principalWithdrawn}`);
  }
}

check().catch(console.error);
