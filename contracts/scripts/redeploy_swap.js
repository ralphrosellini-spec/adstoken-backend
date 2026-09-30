/**
 * redeploy_swap.js
 * Redeploys ONLY the ADSSwap contract (no-tax version) and updates
 * deployedAddresses.json in frontend & backend automatically.
 *
 * Keeps existing: adsToken, usdtToken, stakingVault, treasury.
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("==============================================");
  console.log("🔄 Redeploying ADSSwap (No Tax Version)...");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "BNB");
  console.log("==============================================");

  // Load existing addresses
  const frontendAddressFile = path.resolve(__dirname, "../../frontend/src/contracts/deployedAddresses.json");
  const existing = JSON.parse(fs.readFileSync(frontendAddressFile, "utf-8"));

  const adsAddress    = existing.adsToken;
  const usdtAddress   = existing.usdtToken;
  const vaultAddress  = existing.stakingVault;
  const treasury      = existing.treasury;

  console.log("Using existing ADS Token:    ", adsAddress);
  console.log("Using existing USDT Token:   ", usdtAddress);
  console.log("Using existing Vault:        ", vaultAddress);
  console.log("Using Treasury:              ", treasury);

  // Deploy new ADSSwap
  console.log("\nDeploying new ADSSwap (no sell tax)...");
  const ADSSwap = await hre.ethers.getContractFactory("ADSSwap");
  const swap = await ADSSwap.deploy(adsAddress, usdtAddress, treasury);
  await swap.waitForDeployment();
  const swapAddress = await swap.getAddress();
  console.log("✅ New ADSSwap deployed at:", swapAddress);

  // Fund the new swap contract with ADS & USDT liquidity
  console.log("\nFunding new ADSSwap with liquidity...");
  const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function mint(address to, uint256 amount) external"
  ];
  const signer = await hre.ethers.getSigner(deployer.address);
  const adsContract  = new hre.ethers.Contract(adsAddress, ERC20_ABI, signer);
  const usdtContract = new hre.ethers.Contract(usdtAddress, ERC20_ABI, signer);

  // Check deployer ADS balance before funding
  const adsBal = await adsContract.balanceOf(deployer.address);
  const usdtBal = await usdtContract.balanceOf(deployer.address);
  console.log("Deployer ADS balance:", hre.ethers.formatEther(adsBal));
  console.log("Deployer USDT balance:", hre.ethers.formatEther(usdtBal));

  const fundAds = hre.ethers.parseEther("5000000");
  const fundUsdt = hre.ethers.parseEther("200000");

  if (adsBal >= fundAds) {
    const tx1 = await adsContract.transfer(swapAddress, fundAds);
    await tx1.wait();
    console.log("✅ Funded ADSSwap with 5,000,000 ADS");
  } else {
    console.warn("⚠️  Insufficient ADS balance to fund swap. Fund manually.");
  }

  if (usdtBal >= fundUsdt) {
    const tx2 = await usdtContract.transfer(swapAddress, fundUsdt);
    await tx2.wait();
    console.log("✅ Funded ADSSwap with 200,000 USDT");
  } else {
    // Try minting USDT if it's a MockUSDT
    try {
      const MINT_ABI = ["function mint(address to, uint256 amount) external"];
      const usdtMint = new hre.ethers.Contract(usdtAddress, MINT_ABI, signer);
      await (await usdtMint.mint(deployer.address, fundUsdt)).wait();
      await (await usdtContract.transfer(swapAddress, fundUsdt)).wait();
      console.log("✅ Minted & funded ADSSwap with 200,000 USDT");
    } catch {
      console.warn("⚠️  Could not fund USDT. Fund manually.");
    }
  }

  // Update deployedAddresses.json
  const updated = { ...existing, adsSwap: swapAddress, deployedAt: new Date().toISOString() };

  const backendAddressFile = path.resolve(__dirname, "../../backend/src/config/deployedAddresses.json");

  fs.writeFileSync(frontendAddressFile, JSON.stringify(updated, null, 2));
  fs.writeFileSync(backendAddressFile, JSON.stringify(updated, null, 2));

  console.log("\n==============================================");
  console.log("✅ ADSSwap Redeployment Complete!");
  console.log("==============================================");
  console.log("New ADSSwap address:", swapAddress);
  console.log("Explorer: https://testnet.bscscan.com/address/" + swapAddress);
  console.log("deployedAddresses.json updated in frontend & backend ✓");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
