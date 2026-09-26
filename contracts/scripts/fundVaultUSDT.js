const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const addressesFile = path.resolve(__dirname, "../../frontend/src/contracts/deployedAddresses.json");

  if (!fs.existsSync(addressesFile)) {
    console.error("deployedAddresses.json not found!");
    process.exit(1);
  }

  const deployed = JSON.parse(fs.readFileSync(addressesFile, "utf8"));
  console.log(`Funding StakingVault (${deployed.stakingVault}) with USDT...`);
  console.log("From deployer:", deployer.address);

  const usdt = await hre.ethers.getContractAt("MockUSDT", deployed.usdtToken);
  const deployerUsdtBal = await usdt.balanceOf(deployer.address);
  console.log("Deployer USDT Balance:", hre.ethers.formatEther(deployerUsdtBal));

  const amountToFund = hre.ethers.parseEther("1000000"); // 1,000,000 USDT
  const tx = await usdt.transfer(deployed.stakingVault, amountToFund);
  console.log("Transaction sent. Waiting for confirmation...", tx.hash);
  await tx.wait();

  const vaultBal = await usdt.balanceOf(deployed.stakingVault);
  console.log("✅ Successfully funded Vault with USDT!");
  console.log("Vault USDT Balance:", hre.ethers.formatEther(vaultBal), "USDT");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
