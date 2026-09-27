const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Signer:", signer.address);

  const vaultAddress = "0x494f78c6165D543Cf367c72e29D803a4FAE58133";
  const vault = await hre.ethers.getContractAt("ADSStakingVault", vaultAddress);

  const adsCount = await vault.getUserAdsStakesCount(signer.address);
  const usdtCount = await vault.getUserUsdtStakesCount(signer.address);

  console.log("ADS stakes count:", adsCount.toString());
  console.log("USDT stakes count:", usdtCount.toString());

  for (let i = 0; i < Number(adsCount); i++) {
    const stake = await vault.userAdsStakes(signer.address, i);
    const pending = await vault.calculatePendingAdsReward(signer.address, i);
    console.log(`ADS Stake #${i}: amount=${hre.ethers.formatEther(stake.amount)}, pending=${hre.ethers.formatEther(pending)} ADS, lastClaimTime=${stake.lastClaimTime}`);
  }

  for (let i = 0; i < Number(usdtCount); i++) {
    const stake = await vault.userUsdtStakes(signer.address, i);
    const pending = await vault.calculatePendingUsdtReward(signer.address, i);
    console.log(`USDT Stake #${i}: amount=${hre.ethers.formatEther(stake.amountUsdt)}, pending=${hre.ethers.formatEther(pending)} USDT, lastClaimTime=${stake.lastClaimTime}`);
  }
}

main().catch(console.error);
