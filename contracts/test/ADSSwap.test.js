const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ADSSwap & Demo USDT Minting", function () {
  let ads, usdt, swap;
  let owner, treasury, user1;

  beforeEach(async function () {
    [owner, treasury, user1] = await ethers.getSigners();

    // Deploy MockUSDT
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    usdt = await MockUSDT.deploy();
    await usdt.waitForDeployment();

    // Deploy ADSToken
    const ADSToken = await ethers.getContractFactory("ADSToken");
    ads = await ADSToken.deploy(treasury.address);
    await ads.waitForDeployment();

    // Deploy ADSSwap (1:2 Ratio)
    const ADSSwap = await ethers.getContractFactory("ADSSwap");
    swap = await ADSSwap.deploy(
      await ads.getAddress(),
      await usdt.getAddress(),
      treasury.address
    );
    await swap.waitForDeployment();

    // Fund Swap contract with ADS and USDT liquidity
    await ads.transfer(await swap.getAddress(), ethers.parseEther("1000000"));
    await usdt.transfer(await swap.getAddress(), ethers.parseEther("500000"));
  });

  it("Should allow any user to mint test USDT directly via faucet", async function () {
    const mintAmount = ethers.parseEther("1000");
    await usdt.connect(user1).mint(user1.address, mintAmount);

    const balance = await usdt.balanceOf(user1.address);
    expect(balance).to.equal(mintAmount);
  });

  it("Should swap USDT for ADS at exactly 1:2 ratio (1 USDT = 2 ADS, $0.50 price)", async function () {
    // 1. User mints 500 USDT
    await usdt.connect(user1).mint(user1.address, ethers.parseEther("500"));

    // 2. User approves swap contract
    await usdt.connect(user1).approve(await swap.getAddress(), ethers.parseEther("500"));

    // 3. User swaps 500 USDT -> expects 1,000 ADS
    await swap.connect(user1).swapUSDTForADS(ethers.parseEther("500"));

    const adsBalance = await ads.balanceOf(user1.address);
    const usdtBalance = await usdt.balanceOf(user1.address);

    expect(adsBalance).to.equal(ethers.parseEther("1000")); // 500 * 2 = 1,000 ADS
    expect(usdtBalance).to.equal(0);
  });

  it("Should swap ADS back to USDT with 3% sell tax to Treasury", async function () {
    // User starts with 1,000 ADS
    await ads.transfer(user1.address, ethers.parseEther("1000"));
    await ads.connect(user1).approve(await swap.getAddress(), ethers.parseEther("1000"));

    const initialTreasuryUsdt = await usdt.balanceOf(treasury.address);

    // Swap 1,000 ADS -> gross 500 USDT, 3% tax = 15 USDT, net = 485 USDT
    await swap.connect(user1).swapADSForUSDT(ethers.parseEther("1000"));

    const userUsdt = await usdt.balanceOf(user1.address);
    const finalTreasuryUsdt = await usdt.balanceOf(treasury.address);

    expect(userUsdt).to.equal(ethers.parseEther("485"));
    expect(finalTreasuryUsdt - initialTreasuryUsdt).to.equal(ethers.parseEther("15"));
  });
});
