import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTest } from "./utils/setup";
import { TestContracts, TestAccounts } from "./utils/setup";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("Vault", function () {
  let contracts: TestContracts;
  let accounts: TestAccounts;

  beforeEach(async function () {
    const setup = await setupTest();
    contracts = setup.contracts;
    accounts = setup.accounts;
  });

  describe("Deployment", function () {
    it("Should set the right token addresses and initial state", async function () {
      const vault = contracts.vault;

      expect(await vault.getDepositTotal()).to.equal(0);
    });
  });

  describe("Deposits", function () {
    it("Should accept deposits and update balances correctly", async function () {
      const depositAmount = ethers.parseEther("0.5"); // 0.5 ETH worth
      console.log(await contracts.usdc.balanceOf(accounts.users[0]));
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);
      expect(await contracts.vault.getDepositTotal()).to.equal(depositAmount);
    });

    it("Should emit Deposited event", async function () {
      const depositAmount = ethers.parseEther("0.5"); // 0.5 ETH worth
      await expect(contracts.vault.connect(accounts.users[0]).deposit(depositAmount))
        .to.emit(contracts.vault, "Deposited")
        .withArgs(accounts.users[0].address, depositAmount, anyValue, anyValue);
    });

    it("Should revert when deposit amount is zero", async function () {
      await expect(contracts.vault.connect(accounts.users[0]).deposit(0)).to.be.revertedWith(
        "Min deposit 0.1 ETH",
      );
    });

    it("Should revert when user has insufficient balance", async function () {
      const largeAmount = ethers.parseEther("1000"); // 超过用户余额
      await expect(contracts.vault.connect(accounts.users[0]).deposit(largeAmount)).to.be.reverted;
    });
  });

  describe("Withdrawals", function () {
    const depositAmount = ethers.parseEther("0.5"); // 0.5 ETH worth

    beforeEach(async function () {
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);
    });

    it("Should allow withdrawals and update balances correctly", async function () {
      const balanceBefore = await contracts.usdc.balanceOf(accounts.users[0].address);
      
      // 获取share token地址并approve
      const shareTokenAddress = await contracts.vault.getShareToken();
      const shareTokenContract = await ethers.getContractAt("VaultShareToken", shareTokenAddress);
      await shareTokenContract.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);

      await contracts.vault.connect(accounts.users[0])["withdraw()"]();

      const balanceAfter = await contracts.usdc.balanceOf(accounts.users[0].address);
      expect(balanceAfter - balanceBefore).to.equal(depositAmount);
      expect(await contracts.vault.getDepositTotal()).to.equal(0);
    });

    it("Should emit Withdrawn event", async function () {
      // 获取share token地址并approve
      const shareTokenAddress = await contracts.vault.getShareToken();
      const shareTokenContract = await ethers.getContractAt("VaultShareToken", shareTokenAddress);
      await shareTokenContract.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      
      await expect(contracts.vault.connect(accounts.users[0])["withdraw()"]())
        .to.emit(contracts.vault, "Withdrawn")
        .withArgs(accounts.users[0].address, depositAmount, anyValue, anyValue);
    });

    it("Should revert when user has no deposit", async function () {
      // 获取share token地址并approve
      const shareTokenAddress = await contracts.vault.getShareToken();
      const shareTokenContract = await ethers.getContractAt("VaultShareToken", shareTokenAddress);
      await shareTokenContract.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      
      // 先提取所有资金
      await contracts.vault.connect(accounts.users[0])["withdraw()"]();
      // 再次尝试提取应该失败
      await expect(contracts.vault.connect(accounts.users[0])["withdraw()"]()).to.be.reverted;
    });

    it("Should allow withdrawal from specific round", async function () {
      const currentRoundId = await contracts.lottery.getCurrentRoundId();
      const balanceBefore = await contracts.usdc.balanceOf(accounts.users[0].address);
      
      // 获取share token地址并approve
      const shareTokenAddress = await contracts.vault.getShareToken();
      const shareTokenContract = await ethers.getContractAt("VaultShareToken", shareTokenAddress);
      await shareTokenContract.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      
      await contracts.vault.connect(accounts.users[0])["withdraw(uint256)"](currentRoundId);
      
      const balanceAfter = await contracts.usdc.balanceOf(accounts.users[0].address);
      expect(balanceAfter - balanceBefore).to.equal(depositAmount);
    });
  });

  describe("YieldAggregator Integration", function () {
    it("Should allow owner to set YieldAggregator", async function () {
      const oldYieldAggregator = contracts.yieldAggregator.getAddress();
      const newYieldAggregator = accounts.users[1].address;
      await expect(contracts.vault.connect(accounts.owner).setYieldAggregator(newYieldAggregator))
        .to.emit(contracts.vault, "YieldAggregatorSet")
        .withArgs(oldYieldAggregator, newYieldAggregator);

      expect(await contracts.vault.yieldAggregator()).to.equal(newYieldAggregator);
    });

    it("Should revert when non-owner tries to set YieldAggregator", async function () {
      const newYieldAggregator = accounts.users[1].address;
      await expect(
        contracts.vault.connect(accounts.users[0]).setYieldAggregator(newYieldAggregator),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert when setting YieldAggregator to zero address", async function () {
      await expect(
        contracts.vault.connect(accounts.owner).setYieldAggregator(ethers.ZeroAddress),
      ).to.be.revertedWith("Invalid YieldAggregator address");
    });
  });
});
