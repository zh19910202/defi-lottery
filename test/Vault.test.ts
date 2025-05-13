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
      const usdc = contracts.usdc;

      expect(await vault.usdc()).to.equal(await usdc.getAddress());
      expect(await vault.getUserCount()).to.equal(0);
      expect(await vault.getTotalWeight()).to.equal(0);
    });
  });

  describe("Deposits", function () {
    it("Should accept deposits and update balances correctly", async function () {
      const depositAmount = ethers.parseUnits("100", 6);
      console.log(await contracts.usdc.balanceOf(accounts.users[0]));
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);
      expect(await contracts.vault.getDepositTotal()).to.equal(depositAmount);
    });

    it("Should emit Deposited event", async function () {
      const depositAmount = ethers.parseUnits("100", 6);
      await expect(contracts.vault.connect(accounts.users[0]).deposit(depositAmount))
        .to.emit(contracts.vault, "Deposited")
        .withArgs(accounts.users[0].address, depositAmount, anyValue);
    });

    it("Should revert when deposit amount is zero", async function () {
      await expect(contracts.vault.connect(accounts.users[0]).deposit(0)).to.be.revertedWith(
        "Amount must be greater than zero",
      );
    });

    it("Should revert when user has insufficient USDC balance", async function () {
      const largeAmount = ethers.parseUnits("1000000", 6); // 超过用户余额
      await expect(contracts.vault.connect(accounts.users[0]).deposit(largeAmount)).to.be.reverted;
    });
  });

  describe("Withdrawals", function () {
    const depositAmount = ethers.parseUnits("100", 6);

    beforeEach(async function () {
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);
    });

    it("Should allow withdrawals and update balances correctly", async function () {
      const withdrawAmount = ethers.parseUnits("50", 6);
      const balanceBefore = await contracts.usdc.balanceOf(accounts.users[0].address);

      await contracts.vault.connect(accounts.users[0]).withdraw(withdrawAmount);

      const balanceAfter = await contracts.usdc.balanceOf(accounts.users[0].address);
      expect(balanceAfter - balanceBefore).to.equal(withdrawAmount);
      expect(await contracts.vault.getDepositTotal()).to.equal(depositAmount - withdrawAmount);
    });

    it("Should emit Withdrawn event", async function () {
      const withdrawAmount = ethers.parseUnits("50", 6);
      await expect(contracts.vault.connect(accounts.users[0]).withdraw(withdrawAmount))
        .to.emit(contracts.vault, "Withdrawn")
        .withArgs(accounts.users[0].address, withdrawAmount, anyValue);
    });

    it("Should revert when withdrawal amount is zero", async function () {
      await expect(contracts.vault.connect(accounts.users[0]).withdraw(0)).to.be.revertedWith(
        "Amount must be greater than zero",
      );
    });

    it("Should revert when withdrawal amount exceeds deposit balance", async function () {
      const excessAmount = depositAmount + ethers.parseUnits("1", 6);
      await expect(
        contracts.vault.connect(accounts.users[0]).withdraw(excessAmount),
      ).to.be.revertedWith("Insufficient deposit balance");
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
