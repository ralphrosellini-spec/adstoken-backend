const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 1. Deploy Mock USDT (for testing/local or testnet usage)
  const MockUSDT = await hre.ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  console.log("MockUSDT deployed to:", usdtAddress);

  // 2. Deploy ADSToken (1B fixed supply)
  const treasuryAddress = deployer.address; // Deployer defaults to treasury for initial testing
  const ADSToken = await hre.ethers.getContractFactory("ADSToken");
  const ads = await ADSToken.deploy(treasuryAddress);
  await ads.waitForDeployment();
  const adsAddress = await ads.getAddress();
  console.log("ADSToken deployed to:", adsAddress);

  // 3. Deploy ADSStakingVault
  const ADSStakingVault = await hre.ethers.getContractFactory("ADSStakingVault");
  const vault = await ADSStakingVault.deploy(
    adsAddress,
    usdtAddress,
    treasuryAddress,
    deployer.address, // backend operator
    treasuryAddress  // liquidity wallet
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("ADSStakingVault deployed to:", vaultAddress);

  // 4. Link Staking Vault to ADSToken
  await ads.setStakingVault(vaultAddress);
  console.log("Linked StakingVault to ADSToken successfully!");

  console.log("\n--- DEPLOYMENT SUMMARY ---");
  console.log("ADSToken:        ", adsAddress);
  console.log("ADSStakingVault: ", vaultAddress);
  console.log("USDT Token:      ", usdtAddress);
  console.log("Treasury:        ", treasuryAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
