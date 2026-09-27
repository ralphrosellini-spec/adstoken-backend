const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Signer:", signer.address);
  const balance = await hre.ethers.provider.getBalance(signer.address);
  console.log("BNB Balance:", hre.ethers.formatEther(balance));

  const vaultAddress = "0x494f78c6165D543Cf367c72e29D803a4FAE58133";
  const vault = await hre.ethers.getContractAt("ADSStakingVault", vaultAddress);

  const secondsPerDay = await vault.secondsPerDay();
  const isInstant = await vault.isInstantTestnetMode();
  console.log("Current secondsPerDay:", secondsPerDay.toString());
  console.log("Current isInstantTestnetMode:", isInstant);

  // If isInstant is true, toggle it off so 1 day = 1 minute with NO 0 time!
  if (isInstant) {
    console.log("Setting isInstantTestnetMode to false (1 day = 60s, NO 0 time!)...");
    const tx = await vault.setInstantTestnetMode(false);
    await tx.wait();
    console.log("isInstantTestnetMode is now:", await vault.isInstantTestnetMode());
  }

  // Ensure secondsPerDay is 60
  if (secondsPerDay.toString() !== "60") {
    console.log("Setting secondsPerDay to 60...");
    const tx2 = await vault.setSecondsPerDay(60);
    await tx2.wait();
    console.log("secondsPerDay is now:", (await vault.secondsPerDay()).toString());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
