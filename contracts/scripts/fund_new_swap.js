/**
 * fund_new_swap.js — Sends 50,000 ADS to the new no-tax ADSSwap contract.
 */
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Funding new swap from:", deployer.address);

  const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address) view returns (uint256)"
  ];

  const adsAddress = "0xB4dEBEF4ed214FF2F80340089FB652ffa707ce56";
  const newSwap    = "0x0C250B29B8193A4fC645CD75EA9cCCfB14B3DCB0";

  const ads = new hre.ethers.Contract(adsAddress, ERC20_ABI, deployer);
  const balBefore = await ads.balanceOf(deployer.address);
  console.log("Deployer ADS balance:", hre.ethers.formatEther(balBefore));

  const amount = hre.ethers.parseEther("50000");
  const tx = await ads.transfer(newSwap, amount);
  await tx.wait();
  console.log("✅ Sent 50,000 ADS to new ADSSwap");

  const swapBal = await ads.balanceOf(newSwap);
  console.log("New ADSSwap ADS balance:", hre.ethers.formatEther(swapBal));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
