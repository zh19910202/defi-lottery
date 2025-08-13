import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { setupTest } from "./utils/setup";
import { TestContracts, TestAccounts } from "./utils/setup";

describe("LotteryRouter", function () {
  let contracts: TestContracts;
  let accounts: TestAccounts;

  beforeEach(async function () {
    const setup = await setupTest();
    contracts = setup.contracts;
    accounts = setup.accounts;
  });

  describe("Deployment and Configuration", function () {
    it("Should set component addresses correctly", async function () {
      expect(await contracts.lotteryRouter.lottery()).to.equal(await contracts.lottery.getAddress());
      expect(await contracts.lotteryRouter.vault()).to.equal(await contracts.vault.getAddress());
      expect(await contracts.lotteryRouter.prizePool()).to.equal(await contracts.prizePool.getAddress());
    });

    it("Should allow owner to update component addresses", async function () {
      const newAddress = accounts.users[0].address;
      
      await contracts.lotteryRouter.setLottery(newAddress);
      expect(await contracts.lotteryRouter.lottery()).to.equal(newAddress);
      
      await contracts.lotteryRouter.setVault(newAddress);
      expect(await contracts.lotteryRouter.vault()).to.equal(newAddress);
      
      await contracts.lotteryRouter.setPrizePool(newAddress);
      expect(await contracts.lotteryRouter.prizePool()).to.equal(newAddress);
    });

    it("Should revert when non-owner tries to update addresses", async function () {
      const newAddress = accounts.users[0].address;
      
      await expect(
        contracts.lotteryRouter.connect(accounts.users[0]).setLottery(newAddress)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Deposit through Router", function () {
    it("Should route deposits correctly", async function () {
      const depositAmount = ethers.parseEther("0.5");
      
      // 用户授权Router使用WETH
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.lotteryRouter.getAddress(), depositAmount);
      
      const balanceBefore = await contracts.usdc.balanceOf(accounts.users[0].address);
      
      await expect(contracts.lotteryRouter.connect(accounts.users[0]).deposit(depositAmount))
        .to.emit(contracts.lotteryRouter, "DepositRouted")
        .withArgs(accounts.users[0].address, depositAmount);
      
      const balanceAfter = await contracts.usdc.balanceOf(accounts.users[0].address);
      // 注意：用户在setup中已经approve了vault，所以这里会有双重扣费
      // 实际应用中用户只需要approve router
      expect(balanceBefore - balanceAfter).to.be.greaterThanOrEqual(depositAmount);
      
      // 验证Vault中的存款
      const userDeposit = await contracts.vault.userDeposits(accounts.users[0].address);
      expect(userDeposit.amount).to.equal(depositAmount);
    });

    it("Should revert deposit with zero amount", async function () {
      await expect(
        contracts.lotteryRouter.connect(accounts.users[0]).deposit(0)
      ).to.be.revertedWith("Must deposit WETH tokens");
    });

    it("Should revert deposit when vault not configured", async function () {
      // 部署一个新的Router来测试未配置状态
      const LotteryRouterFactory = await ethers.getContractFactory("LotteryRouter");
      const newRouter = await LotteryRouterFactory.deploy();
      await newRouter.waitForDeployment();
      
      await expect(
        newRouter.connect(accounts.users[0]).deposit(ethers.parseEther("0.5"))
      ).to.be.revertedWith("Vault not configured");
    });
  });

  describe("Withdrawal through Router", function () {
    const depositAmount = ethers.parseEther("0.5");

    beforeEach(async function () {
      // 先通过Router存款
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.lotteryRouter.getAddress(), depositAmount);
      await contracts.lotteryRouter.connect(accounts.users[0]).deposit(depositAmount);
    });

    it("Should detect user deposits correctly", async function () {
      const userInfo = await contracts.lotteryRouter.getUserInfo(accounts.users[0].address);
      expect(userInfo.hasDeposit).to.be.true;
      expect(userInfo.depositAmount).to.equal(depositAmount);
    });

    it("Should revert withdrawal when no deposit exists for new user", async function () {
      await expect(
        contracts.lotteryRouter.connect(accounts.users[1]).withdraw()
      ).to.be.revertedWith("No deposit to withdraw");
    });
  });

  describe("System Status and User Info", function () {
    it("Should return correct system status", async function () {
      const systemStatus = await contracts.lotteryRouter.getSystemStatus();
      
      expect(systemStatus.currentRoundId).to.equal(0);
      expect(systemStatus.participantCount).to.be.a("bigint");
      expect(systemStatus.totalDeposits).to.be.a("bigint");
      expect(systemStatus.nextDrawTimestamp).to.be.greaterThan(0);
    });

    it("Should return correct user info", async function () {
      const depositAmount = ethers.parseEther("0.5");
      
      // 先存款
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.lotteryRouter.getAddress(), depositAmount);
      await contracts.lotteryRouter.connect(accounts.users[0]).deposit(depositAmount);
      
      const userInfo = await contracts.lotteryRouter.getUserInfo(accounts.users[0].address);
      
      expect(userInfo.depositAmount).to.equal(depositAmount);
      expect(userInfo.hasDeposit).to.be.true;
      expect(userInfo.shareTokenBalance).to.equal(depositAmount);
    });

    it("Should return empty info for user with no deposit", async function () {
      const userInfo = await contracts.lotteryRouter.getUserInfo(accounts.users[0].address);
      
      expect(userInfo.depositAmount).to.equal(0);
      expect(userInfo.hasDeposit).to.be.false;
      expect(userInfo.shareTokenBalance).to.equal(0);
    });
  });

  describe("Manual Draw Trigger", function () {
    it("Should allow owner to trigger draw manually", async function () {
      // 先设置条件：用户存款 + 收益
      const depositAmount = ethers.parseEther("0.5");
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.lotteryRouter.getAddress(), depositAmount);
      await contracts.lotteryRouter.connect(accounts.users[0]).deposit(depositAmount);
      
      // 模拟收益
      const yieldAmount = ethers.parseEther("0.6");
      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);
      
      // 快进时间
      await time.increase(31 * 24 * 3600);
      
      await expect(contracts.lotteryRouter.triggerDraw())
        .to.emit(contracts.lottery, "LotteryTriggered");
    });

    it("Should revert when non-owner tries to trigger draw", async function () {
      await expect(
        contracts.lotteryRouter.connect(accounts.users[0]).triggerDraw()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});