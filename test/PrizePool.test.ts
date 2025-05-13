import { expect } from "chai";
import { ethers } from "hardhat";
const { parseUnits } = ethers;
import { setupTest } from "./utils/setup";
import { TestContracts, TestAccounts } from "./utils/setup";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("PrizePool", function () {
  let contracts: TestContracts;
  let accounts: TestAccounts;

  beforeEach(async function () {
    const setup = await setupTest();
    contracts = setup.contracts;
    accounts = setup.accounts;

    // 为测试账户授权PrizePool使用USDC
    await contracts.usdc
      .connect(accounts.users[0])
      .approve(await contracts.prizePool.getAddress(), ethers.MaxUint256);
    await contracts.usdc
      .connect(accounts.users[1])
      .approve(await contracts.prizePool.getAddress(), ethers.MaxUint256);
  });

  describe("Deployment", function () {
    it("Should set the right token addresses and initial state", async function () {
      const { contracts } = await setupTest();
      const prizePool = contracts.prizePool;
      const usdc = contracts.usdc;
      const lottery = contracts.lottery;

      expect(await prizePool.usdc()).to.equal(await usdc.getAddress());
      expect(await prizePool.comet()).to.equal(await contracts.comet.getAddress());
      expect(await prizePool.lottery()).to.equal(await lottery.getAddress());
      expect(await prizePool.getPrizePoolAmount()).to.equal(0);
    });
  });

  describe("Deposits", function () {
    it("Should accept deposits through vault", async function () {
      const depositAmount = parseUnits("100", 6);
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      expect(await contracts.vault.getDepositTotal()).to.equal(depositAmount);
    });

    it("Should emit Deposited event", async function () {
      const depositAmount = parseUnits("100", 6);
      const tx = await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      await expect(tx)
        .to.emit(contracts.vault, "Deposited")
        .withArgs(accounts.users[0].address, depositAmount, anyValue);
    });

    it("Should revert when deposit amount is zero", async function () {
      await expect(contracts.vault.connect(accounts.users[0]).deposit(0)).to.be.revertedWith(
        "Amount must be greater than zero",
      );
    });
  });

  describe("Withdrawals", function () {
    const depositAmount = parseUnits("100", 6);

    beforeEach(async function () {
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);
    });

    it("Should allow withdrawals through vault", async function () {
      const withdrawAmount = parseUnits("50", 6);
      const balanceBefore = await contracts.usdc.balanceOf(accounts.users[0].address);
      console.log("balanceBefore", balanceBefore);

      await contracts.vault.connect(accounts.users[0]).withdraw(withdrawAmount);

      const balanceAfter = await contracts.usdc.balanceOf(accounts.users[0].address);
      console.log("balanceAfter", balanceAfter);
      expect(balanceAfter - balanceBefore).to.equal(withdrawAmount);
      expect(await contracts.vault.getDepositTotal()).to.equal(depositAmount - withdrawAmount);
    });

    it("Should emit Withdrawn event", async function () {
      const withdrawAmount = parseUnits("50", 6);
      const tx = await contracts.vault.connect(accounts.users[0]).withdraw(withdrawAmount);

      await expect(tx)
        .to.emit(contracts.vault, "Withdrawn")
        .withArgs(accounts.users[0].address, withdrawAmount, anyValue);
    });

    it("Should revert when withdrawal amount exceeds deposit", async function () {
      const withdrawAmount = depositAmount + ethers.toBigInt(1);
      await expect(
        contracts.vault.connect(accounts.users[0]).withdraw(withdrawAmount),
      ).to.be.revertedWith("Insufficient deposit balance");
    });
  });

  describe("Prize Distribution", function () {
    const depositAmount = parseUnits("1000", 6);

    beforeEach(async function () {
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);
    });

    it("Should allow prize distribution through lottery", async function () {
      // 增加时间以满足开奖间隔
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);

      // 触发开奖
      await contracts.lottery.performUpkeep("0x");

      // 模拟 VRF 回调
      const requestId = 1;
      const randomWords = [ethers.toBigInt("123456")];
      await contracts.vrfCoordinator.fulfillRandomWords(
        requestId,
        await contracts.lottery.getAddress(),
        randomWords,
      );

      // 验证中奖信息
      const lotteryInfo = await contracts.lottery.lotteryRound(0);
      expect(lotteryInfo.winner).to.equal(accounts.users[0].address);
      expect(lotteryInfo.isClaimed).to.be.false;
    });
  });
});
