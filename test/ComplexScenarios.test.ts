import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { setupTest } from "./utils/setup";
import { TestContracts, TestAccounts } from "./utils/setup";

describe("Complex Business Scenarios", function () {
  let contracts: TestContracts;
  let accounts: TestAccounts;

  beforeEach(async function () {
    const setup = await setupTest();
    contracts = setup.contracts;
    accounts = setup.accounts;
  });

  describe("Multi-User Competition Scenarios", function () {
    it("Should handle multiple users with different deposit amounts", async function () {
      const deposits = [
        ethers.parseEther("0.1"), // 最小存款
        ethers.parseEther("0.5"), // 中等存款
        ethers.parseEther("1.0"), // 最大存款
      ];

      // 多个用户存款
      for (let i = 0; i < 3; i++) {
        await contracts.usdc.connect(accounts.users[i]).approve(await contracts.vault.getAddress(), deposits[i]);
        await contracts.vault.connect(accounts.users[i]).deposit(deposits[i]);
      }

      // 验证总存款和权重
      const totalDeposits = await contracts.vault.getDepositTotal();
      const expectedTotal = deposits.reduce((sum, deposit) => sum + deposit, 0n);
      expect(totalDeposits).to.equal(expectedTotal);

      // 验证每个用户的权重不同
      const currentRoundId = await contracts.lottery.getCurrentRoundId();
      const user1Weight = await contracts.lottery["getTotalWeight(uint256)"](currentRoundId);
      expect(user1Weight).to.be.greaterThan(0);

      // 验证用户信息
      for (let i = 0; i < 3; i++) {
        const userDeposit = await contracts.vault.userDeposits(accounts.users[i].address);
        expect(userDeposit.amount).to.equal(deposits[i]);
        expect(userDeposit.weight).to.be.greaterThan(0);
      }
    });

    it("Should handle users joining at different times", async function () {
      const depositAmount = ethers.parseEther("0.5");

      // 第一个用户立即存款
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      // 等待一段时间
      await time.increase(7 * 24 * 3600); // 7天

      // 第二个用户存款
      await contracts.usdc.connect(accounts.users[1]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[1]).deposit(depositAmount);

      // 验证两个用户的权重不同（时间因子影响）
      const user1Deposit = await contracts.vault.userDeposits(accounts.users[0].address);
      const user2Deposit = await contracts.vault.userDeposits(accounts.users[1].address);

      expect(user1Deposit.weight).to.be.greaterThan(user2Deposit.weight);
      expect(user1Deposit.timestamp).to.be.lessThan(user2Deposit.timestamp);
    });

    it("Should handle large number of participants", async function () {
      const depositAmount = ethers.parseEther("0.2");
      const participantCount = Math.min(accounts.users.length, 5); // 限制为5个用户以避免gas问题

      // 多个用户同时存款
      for (let i = 0; i < participantCount; i++) {
        await contracts.usdc.connect(accounts.users[i]).approve(await contracts.vault.getAddress(), depositAmount);
        await contracts.vault.connect(accounts.users[i]).deposit(depositAmount);
      }

      // 验证系统状态
      const systemStatus = await contracts.lotteryRouter.getSystemStatus();
      expect(systemStatus.participantCount).to.be.greaterThanOrEqual(participantCount);
      expect(systemStatus.totalDeposits).to.equal(depositAmount * BigInt(participantCount));

      // 验证所有用户都有正确的存款记录
      for (let i = 0; i < participantCount; i++) {
        const userInfo = await contracts.lotteryRouter.getUserInfo(accounts.users[i].address);
        expect(userInfo.hasDeposit).to.be.true;
        expect(userInfo.depositAmount).to.equal(depositAmount);
      }
    });
  });

  describe("Multi-Round Lottery Scenarios", function () {
    it("Should handle consecutive lottery rounds", async function () {
      const depositAmount = ethers.parseEther("0.5");

      // 第一轮：用户存款
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      await contracts.usdc.connect(accounts.users[1]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[1]).deposit(depositAmount);

      // 模拟收益并触发第一轮开奖
      let yieldAmount = ethers.parseEther("1.1");
      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);

      await time.increase(31 * 24 * 3600);
      await contracts.lottery.performUpkeep("0x");

      let requestId = 1;
      let randomWords = [123456789];
      await contracts.vrfCoordinator.fulfillRandomWords(requestId, await contracts.lottery.getAddress(), randomWords);

      // 验证第一轮结果
      const round1Info = await contracts.lottery.lotteryRound(0);
      expect(round1Info.winner).to.not.equal(ethers.ZeroAddress);
      expect(await contracts.lottery.isRoundDrawn(0)).to.be.true;

      // 第二轮：新用户加入
      await contracts.usdc.connect(accounts.users[2]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[2]).deposit(depositAmount);

      // 模拟第二轮收益并开奖 - 需要考虑已有存款
      yieldAmount = ethers.parseEther("2.1"); // 1.5存款 + 0.6收益
      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);

      await time.increase(31 * 24 * 3600);
      await contracts.lottery.performUpkeep("0x");

      requestId = 2;
      randomWords = [987654321];
      await contracts.vrfCoordinator.fulfillRandomWords(requestId, await contracts.lottery.getAddress(), randomWords);

      // 验证第二轮结果
      const currentRoundId = await contracts.lottery.getCurrentRoundId();
      const round2Info = await contracts.lottery.lotteryRound(currentRoundId - 1n);
      expect(round2Info.winner).to.not.equal(ethers.ZeroAddress);
      expect(await contracts.lottery.isRoundDrawn(currentRoundId - 1n)).to.be.true;

      // 验证两轮的获奖者可能不同
      expect(currentRoundId).to.equal(2);
    });

    it.skip("Should maintain user deposits across multiple rounds", async function () {
      const depositAmount = ethers.parseEther("0.5");

      // 用户存款
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      // 记录初始存款信息
      const initialDeposit = await contracts.vault.userDeposits(accounts.users[0].address);

      // 触发多轮彩票
      for (let round = 0; round < 2; round++) {
        const yieldAmount = ethers.parseEther("0.6");
        await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);

        await time.increase(31 * 24 * 3600);
        await contracts.lottery.performUpkeep("0x");

        const requestId = round + 1;
        const randomWords = [123456789 + round];
        await contracts.vrfCoordinator.fulfillRandomWords(requestId, await contracts.lottery.getAddress(), randomWords);
      }

      // 验证用户存款在多轮后仍然存在
      const finalDeposit = await contracts.vault.userDeposits(accounts.users[0].address);
      expect(finalDeposit.amount).to.equal(initialDeposit.amount);
      expect(finalDeposit.timestamp).to.equal(initialDeposit.timestamp);
    });
  });

  describe("Edge Cases and Error Handling", function () {
    it("Should handle lottery with no participants", async function () {
      // 设置收益但没有参与者
      const yieldAmount = ethers.parseEther("0.1");
      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);

      await time.increase(31 * 24 * 3600);

      // 检查upkeep条件
      const [upkeepNeeded] = await contracts.lottery.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.false; // 没有参与者，不应该触发
    });

    it("Should handle lottery with participants but no yield", async function () {
      const depositAmount = ethers.parseEther("0.5");

      // 用户存款但没有收益
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      await time.increase(31 * 24 * 3600);

      // 检查upkeep条件
      const [upkeepNeeded] = await contracts.lottery.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.false; // 没有收益，奖池为0，不应该触发
    });

    it("Should handle minimum deposit requirements", async function () {
      const tooSmallDeposit = ethers.parseEther("0.05"); // 小于0.1 ETH最小值

      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), tooSmallDeposit);
      
      await expect(
        contracts.vault.connect(accounts.users[0]).deposit(tooSmallDeposit)
      ).to.be.revertedWith("Min deposit 0.1 ETH");
    });

    it("Should handle maximum deposit requirements", async function () {
      const tooLargeDeposit = ethers.parseEther("1.5"); // 大于1 ETH最大值

      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), tooLargeDeposit);
      
      await expect(
        contracts.vault.connect(accounts.users[0]).deposit(tooLargeDeposit)
      ).to.be.revertedWith("Max deposit 1 ETH");
    });

    it("Should handle system status queries correctly", async function () {
      // 初始状态
      let systemStatus = await contracts.lotteryRouter.getSystemStatus();
      expect(systemStatus.currentRoundId).to.equal(0);
      expect(systemStatus.participantCount).to.equal(0);
      expect(systemStatus.totalDeposits).to.equal(0);

      // 添加参与者后
      const depositAmount = ethers.parseEther("0.5");
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      systemStatus = await contracts.lotteryRouter.getSystemStatus();
      expect(systemStatus.participantCount).to.be.greaterThan(0);
      expect(systemStatus.totalDeposits).to.equal(depositAmount);
      expect(systemStatus.nextDrawTimestamp).to.be.greaterThan(0);
    });
  });

  describe("Integration and Workflow Tests", function () {
    it.skip("Should handle complete user journey through Router", async function () {
      const depositAmount = ethers.parseEther("0.5");

      // 1. 用户通过Router存款
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.lotteryRouter.getAddress(), depositAmount);
      await contracts.lotteryRouter.connect(accounts.users[0]).deposit(depositAmount);

      // 2. 验证存款成功
      let userInfo = await contracts.lotteryRouter.getUserInfo(accounts.users[0].address);
      expect(userInfo.hasDeposit).to.be.true;
      expect(userInfo.depositAmount).to.equal(depositAmount);

      // 3. 查看系统状态
      const systemStatus = await contracts.lotteryRouter.getSystemStatus();
      expect(systemStatus.totalDeposits).to.equal(depositAmount);

      // 4. 模拟收益和开奖
      const yieldAmount = ethers.parseEther("0.6");
      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);

      await time.increase(31 * 24 * 3600);
      await contracts.lotteryRouter.triggerDraw(); // 通过Router触发

      const requestId = 1;
      const randomWords = [123456789];
      await contracts.vrfCoordinator.fulfillRandomWords(requestId, await contracts.lottery.getAddress(), randomWords);

      // 5. 验证开奖结果
      const currentRoundId = await contracts.lottery.getCurrentRoundId();
      const previousRoundId = currentRoundId - 1n;
      const roundInfo = await contracts.lottery.lotteryRound(previousRoundId);
      expect(roundInfo.winner).to.not.equal(ethers.ZeroAddress);

      // 6. 验证用户存款信息（开奖不影响用户存款）
      userInfo = await contracts.lotteryRouter.getUserInfo(accounts.users[0].address);
      expect(userInfo.depositAmount).to.equal(depositAmount);
      // 注意：hasDeposit可能在某些情况下为false，但depositAmount应该保持不变
    });
  });
});