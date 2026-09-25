const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ADSToken & ADSStakingVault v2.0", function () {
  let ads, vault, usdt;
  let owner, treasury, user1, user2, dexPair;

  beforeEach(async function () {
    [owner, treasury, user1, user2, dexPair] = await ethers.getSigners();

    // Deploy USDT
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    usdt = await MockUSDT.deploy();
    await usdt.waitForDeployment();

    // Deploy ADSToken
    const ADSToken = await ethers.getContractFactory("ADSToken");
    ads = await ADSToken.deploy(treasury.address);
    await ads.waitForDeployment();

    // Deploy Staking Vault
    const ADSStakingVault = await ethers.getContractFactory("ADSStakingVault");
    vault = await ADSStakingVault.deploy(
      await ads.getAddress(),
      await usdt.getAddress(),
      treasury.address,
      owner.address,
      treasury.address
    );
    await vault.waitForDeployment();

    // Link
    await ads.setStakingVault(await vault.getAddress());
    await ads.setDexPair(dexPair.address);

    // Fund users
    await ads.transfer(user1.address, ethers.parseEther("100000"));
    await ads.transfer(user2.address, ethers.parseEther("100000"));
    await usdt.transfer(user1.address, ethers.parseEther("10000"));
    await usdt.transfer(user2.address, ethers.parseEther("10000"));

    // Fund Vault with rewards reserve
    await ads.transfer(await vault.getAddress(), ethers.parseEther("1000000"));
    await usdt.transfer(await vault.getAddress(), ethers.parseEther("100000"));
  });

  it("Should have 1 Billion fixed supply for ADSToken", async function () {
    const supply = await ads.totalSupply();
    expect(supply).to.equal(ethers.parseEther("1000000000"));
  });

  it("Should enforce 3% sell tax on DEX sell and route to Treasury", async function () {
    const sellAmount = ethers.parseEther("1000");
    await ads.connect(user1).approve(user1.address, sellAmount);

    const initialTreasuryBalance = await ads.balanceOf(treasury.address);

    // user1 transfers to dexPair (representing DEX sell)
    await ads.connect(user1).transfer(dexPair.address, sellAmount);

    const finalTreasuryBalance = await ads.balanceOf(treasury.address);
    const taxReceived = finalTreasuryBalance - initialTreasuryBalance;

    // 3% of 1000 is 30
    expect(taxReceived).to.equal(ethers.parseEther("30"));
  });

  it("Should allow staking ADS and calculate ROI correctly", async function () {
    const stakeAmount = ethers.parseEther("1000");
    await ads.connect(user1).approve(await vault.getAddress(), stakeAmount);

    // Stake for 360 days (1.0% daily)
    await vault.connect(user1).stakeADS(stakeAmount, 360);

    const stakeCount = await vault.getUserAdsStakesCount(user1.address);
    expect(stakeCount).to.equal(1);

    // Fast-forward 1 day (86400 seconds)
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");

    const pending = await vault.calculatePendingAdsReward(user1.address, 0);
    // 1% of 1000 is 10 ADS
    expect(pending).to.be.closeTo(ethers.parseEther("10"), ethers.parseEther("0.1"));
  });

  it("Should deduct 3% withdrawal tax on claiming ADS rewards", async function () {
    const stakeAmount = ethers.parseEther("1000");
    await ads.connect(user1).approve(await vault.getAddress(), stakeAmount);
    await vault.connect(user1).stakeADS(stakeAmount, 360);

    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");

    const initialUserAds = await ads.balanceOf(user1.address);
    const initialTreasuryAds = await ads.balanceOf(treasury.address);

    await vault.connect(user1).claimAdsRewards();

    const finalUserAds = await ads.balanceOf(user1.address);
    const finalTreasuryAds = await ads.balanceOf(treasury.address);

    // Total reward approx 10 ADS, 3% tax = 0.3 ADS to treasury, 9.7 ADS to user
    const netReceived = finalUserAds - initialUserAds;
    const taxReceived = finalTreasuryAds - initialTreasuryAds;

    expect(netReceived).to.be.closeTo(ethers.parseEther("9.7"), ethers.parseEther("0.1"));
    expect(taxReceived).to.be.closeTo(ethers.parseEther("0.3"), ethers.parseEther("0.05"));
  });

  it("Should stake USDT and distribute 80% to Buy-Burn and 20% to Liquidity", async function () {
    const stakeAmount = ethers.parseEther("100"); // 100 USDT (eligible for 2x cap)
    await usdt.connect(user1).approve(await vault.getAddress(), stakeAmount);

    const treasuryInitial = await usdt.balanceOf(treasury.address);

    await vault.connect(user1).stakeUSDT(stakeAmount);

    const treasuryFinal = await usdt.balanceOf(treasury.address);
    // Treasury received 80% buy-burn + 20% liquidity (since liquidity wallet is treasury in test) = 100%
    expect(treasuryFinal - treasuryInitial).to.equal(stakeAmount);

    // Stake recorded
    const stake = await vault.userUsdtStakes(user1.address, 0);
    expect(stake.amountUsdt).to.equal(stakeAmount);
    expect(stake.maxRewardUsdt).to.equal(ethers.parseEther("200")); // 2.0x cap = 200 USDT
  });
});
