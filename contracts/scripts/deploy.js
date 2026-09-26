const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  console.log("==================================================");
  console.log(`🚀 Deploying ADSToken v2.0 System to ${network}...`);
  console.log("Deployer Address:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer Balance:", hre.ethers.formatEther(balance), "BNB");
  console.log("==================================================");

  // 1. Deploy Mock USDT (for testing & staking Module 2)
  console.log("1. Deploying MockUSDT...");
  const MockUSDT = await hre.ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  console.log("   MockUSDT deployed to:", usdtAddress);

  // 2. Deploy ADSToken (1,000,000,000 ADS Fixed Supply)
  console.log("2. Deploying ADSToken (1B fixed supply)...");
  const treasuryAddress = deployer.address; // Deployer serves as treasury in testnet
  const ADSToken = await hre.ethers.getContractFactory("ADSToken");
  const ads = await ADSToken.deploy(treasuryAddress);
  await ads.waitForDeployment();
  const adsAddress = await ads.getAddress();
  console.log("   ADSToken deployed to:", adsAddress);

  // 3. Deploy ADSStakingVault
  // On BSC Testnet: Default to 60s per day for instant testing of 30d/360d staking and rewards!
  // On BSC Mainnet: Enforce 86400s (24 hours).
  const isMainnet = network === "bscMainnet";
  const secondsPerDay = isMainnet ? 86400 : (process.env.SECONDS_PER_DAY ? parseInt(process.env.SECONDS_PER_DAY) : 60);
  console.log(`3. Deploying ADSStakingVault (Timing: ${secondsPerDay} seconds = 1 Day)...`);

  const ADSStakingVault = await hre.ethers.getContractFactory("ADSStakingVault");
  const vault = await ADSStakingVault.deploy(
    adsAddress,
    usdtAddress,
    treasuryAddress,
    deployer.address, // backend operator
    treasuryAddress,  // liquidity support
    secondsPerDay
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("   ADSStakingVault deployed to:", vaultAddress);

  // 4. Configure Token with Vault
  console.log("4. Linking StakingVault to ADSToken...");
  const txLink = await ads.setStakingVault(vaultAddress);
  await txLink.wait();
  console.log("   StakingVault linked successfully.");

  // 5. Fund StakingVault with initial rewards reserve (10,000,000 ADS)
  console.log("5. Funding StakingVault with 10M ADS staking reward reserve...");
  const fundTx = await ads.transfer(vaultAddress, hre.ethers.parseEther("10000000"));
  await fundTx.wait();
  console.log("   StakingVault funded successfully.");

  const addresses = {
    network,
    chainId: hre.network.config.chainId || 97,
    deployer: deployer.address,
    treasury: treasuryAddress,
    adsToken: adsAddress,
    stakingVault: vaultAddress,
    usdtToken: usdtAddress,
    deployedAt: new Date().toISOString(),
  };

  // Automatically write to frontend
  const frontendDir = path.resolve(__dirname, "../../frontend/src/contracts");
  if (!fs.existsSync(frontendDir)) {
    fs.mkdirSync(frontendDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(frontendDir, "deployedAddresses.json"),
    JSON.stringify(addresses, null, 2)
  );

  // Automatically write to backend
  const backendDir = path.resolve(__dirname, "../../backend/src/config");
  if (!fs.existsSync(backendDir)) {
    fs.mkdirSync(backendDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(backendDir, "deployedAddresses.json"),
    JSON.stringify(addresses, null, 2)
  );

  console.log("\n==================================================");
  console.log("✅ DEPLOYMENT COMPLETE & SYNCED TO DAPP & API!");
  console.log("==================================================");
  console.log("ADSToken:         ", adsAddress);
  console.log("ADSStakingVault:  ", vaultAddress);
  console.log("USDT Token:       ", usdtAddress);
  console.log("Treasury:         ", treasuryAddress);
  console.log(`Explorer:          https://testnet.bscscan.com/address/${adsAddress}`);
  console.log("==================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
