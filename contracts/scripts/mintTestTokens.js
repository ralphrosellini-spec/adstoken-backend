const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const addressesFile = path.resolve(__dirname, "../../frontend/src/contracts/deployedAddresses.json");

  if (!fs.existsSync(addressesFile)) {
    console.error("Please deploy contracts first using: npm run deploy:bscTestnet");
    process.exit(1);
  }

  const deployed = JSON.parse(fs.readFileSync(addressesFile, "utf8"));
  const targetRecipient = process.env.RECIPIENT || deployer.address;

  console.log(`Sending 50,000 ADS and 5,000 USDT to ${targetRecipient}...`);

  const ads = await hre.ethers.getContractAt("ADSToken", deployed.adsToken);
  const usdt = await hre.ethers.getContractAt("MockUSDT", deployed.usdtToken);

  const tx1 = await ads.transfer(targetRecipient, hre.ethers.parseEther("50000"));
  await tx1.wait();
  console.log("Transferred 50,000 ADS!");

  const tx2 = await usdt.transfer(targetRecipient, hre.ethers.parseEther("5000"));
  await tx2.wait();
  console.log("Transferred 5,000 USDT!");

  console.log(`\n🎉 Success! Check wallet on BSCScan: https://testnet.bscscan.com/address/${targetRecipient}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
