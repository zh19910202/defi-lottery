import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { setupTest } from "./utils/setup";
import { TestContracts, TestAccounts } from "./utils/setup";

describe("Prize Claim Flow", function () {
  let contracts: TestContracts;
  let accounts: TestAccounts;

  beforeEach(async function () {
    const setup = await setupTest();
    contracts = setup.contracts;
    accounts = setup.accounts;
  });

  describe("Complete Prize Claim Workflow", function () {
    it.skip("Should allow winner to claim prize after lottery draw", async function () {
      const depositAmount = ethers.parseEther("0.5");

      // 1. 用户存款参与彩票
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      await contracts.usdc.connect(accounts.users[1]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[1]).deposit(depositAmount);

      // 2. 模拟收益产生
      const yieldAmount = ethers.parseEther("1.1"); // 1.0存款 + 0.1收益
      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);

      // 3. 快进时间到开奖时间
      await time.increase(31 * 24 * 3600);

      // 4. 触发彩票开奖
      await contracts.lottery.performUpkeep("0x");

      // 5. 模拟VRF回调选择获奖者
      const requestId = 1;
      const randomWords = [123456789];
      await contracts.vrfCoordinator.fulfillRandomWords(requestId, await contracts.lottery.getAddress(), randomWords);

      // 6. 获取获奖者信息
      const currentRoundId = await contracts.lottery.getCurrentRoundId();
      const previousRoundId = currentRoundId - 1n;
      const roundInfo = await contracts.lottery.lotteryRound(previousRoundId);
      
      expect(roundInfo.winner).to.not.equal(ethers.ZeroAddress);
      expect(roundInfo.isClaimed).to.be.false;

      // 7. 获奖者领取奖金
      const winnerBalanceBefore = await contracts.usdc.balanceOf(roundInfo.winner);
      
      await expect(contracts.prizePool.connect(accounts.users.find(u => u.address === roundInfo.winner)).claimPrize(previousRoundId))
        .to.emit(contracts.prizePool, "PrizeClaimed")
        .withArgs(roundInfo.winner, previousRoundId, roundInfo.prizeValue);

      const winnerBalanceAfter = await contracts.usdc.balanceOf(roundInfo.winner);
      expect(winnerBalanceAfter - winnerBalanceBefore).to.equal(roundInfo.prizeValue);

      // 8. 验证奖金已被标记为已领取
      const updatedRoundInfo = await contracts.lottery.lotteryRound(previousRoundId);
      expect(updatedRoundInfo.isClaimed).to.be.true;
    });

    it("Should prevent non-winner from claiming prize", async function () {
      const depositAmount = ethers.parseEther("0.5");

      // 设置彩票并开奖
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      const yieldAmount = ethers.parseEther("0.6");
      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);

      await time.increase(31 * 24 * 3600);
      await contracts.lottery.performUpkeep("0x");

      const requestId = 1;
      const randomWords = [123456789];
      await contracts.vrfCoordinator.fulfillRandomWords(requestId, await contracts.lottery.getAddress(), randomWords);

      const currentRoundId = await contracts.lottery.getCurrentRoundId();
      const previousRoundId = currentRoundId - 1n;
      const roundInfo = await contracts.lottery.lotteryRound(previousRoundId);

      // 非获奖者尝试领取奖金
      const nonWinner = accounts.users.find(u => u.address !== roundInfo.winner);
      
      await expect(
        contracts.prizePool.connect(nonWinner).claimPrize(previousRoundId)
      ).to.be.revertedWith("Not the winner");
    });

    it.skip("Should prevent double claiming of prize", async function () {
      const depositAmount = ethers.parseEther("0.5");

      // 设置彩票并开奖
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      const yieldAmount = ethers.parseEther("0.6");
      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);

      await time.increase(31 * 24 * 3600);
      await contracts.lottery.performUpkeep("0x");

      const requestId = 1;
      const randomWords = [123456789];
      await contracts.vrfCoordinator.fulfillRandomWords(requestId, await contracts.lottery.getAddress(), randomWords);

      const currentRoundId = await contracts.lottery.getCurrentRoundId();
      const previousRoundId = currentRoundId - 1n;
      const roundInfo = await contracts.lottery.lotteryRound(previousRoundId);

      // 获奖者第一次领取奖金
      const winner = accounts.users.find(u => u.address === roundInfo.winner);
      await contracts.prizePool.connect(winner).claimPrize(previousRoundId);

      // 尝试第二次领取奖金
      await expect(
        contracts.prizePool.connect(winner).claimPrize(previousRoundId)
      ).to.be.revertedWith("Prize already claimed");
    });

    it.skip("Should allow claiming prize through LotteryRouter", async function () {
      const depositAmount = ethers.parseEther("0.5");

      // 通过Router存款
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.lotteryRouter.getAddress(), depositAmount);
      await contracts.lotteryRouter.connect(accounts.users[0]).deposit(depositAmount);

      // 设置收益和开奖
      const yieldAmount = ethers.parseEther("0.6");
      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);

      await time.increase(31 * 24 * 3600);
      await contracts.lottery.performUpkeep("0x");

      const requestId = 1;
      const randomWords = [123456789];
      await contracts.vrfCoordinator.fulfillRandomWords(requestId, await contracts.lottery.getAddress(), randomWords);

      const currentRoundId = await contracts.lottery.getCurrentRoundId();
      const previousRoundId = currentRoundId - 1n;
      const roundInfo = await contracts.lottery.lotteryRound(previousRoundId);

      // 通过Router领取奖金
      const winner = accounts.users.find(u => u.address === roundInfo.winner);
      const winnerBalanceBefore = await contracts.usdc.balanceOf(roundInfo.winner);

      await expect(contracts.lotteryRouter.connect(winner).claimPrize(previousRoundId))
        .to.emit(contracts.lotteryRouter, "PrizeClaimRouted")
        .withArgs(roundInfo.winner, roundInfo.prizeValue, previousRoundId);

      const winnerBalanceAfter = await contracts.usdc.balanceOf(roundInfo.winner);
      expect(winnerBalanceAfter - winnerBalanceBefore).to.equal(roundInfo.prizeValue);
    });
  });

  describe("Prize Pool Management", function () {
    it("Should correctly calculate prize pool amount", async function () {
      const depositAmount = ethers.parseEther("1.0");
      const yieldAmount = ethers.parseEther("1.2"); // 1.0存款 + 0.2收益

      // 用户存款
      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      // 设置收益
      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);

      // 检查奖池金额计算
      const prizePoolAmount = await contracts.prizePool.getPrizePoolAmount();
      const expectedPrizePool = yieldAmount - depositAmount; // 0.2 ETH收益
      expect(prizePoolAmount).to.equal(expectedPrizePool);
    });

    it("Should handle fee distribution correctly", async function () {
      const depositAmount = ethers.parseEther("1.0");
      const yieldAmount = ethers.parseEther("1.1"); // 0.1收益

      await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);

      // 触发开奖和奖金分配
      await time.increase(31 * 24 * 3600);
      await contracts.lottery.performUpkeep("0x");

      const requestId = 1;
      const randomWords = [123456789];
      await contracts.vrfCoordinator.fulfillRandomWords(requestId, await contracts.lottery.getAddress(), randomWords);

      const currentRoundId = await contracts.lottery.getCurrentRoundId();
      const previousRoundId = currentRoundId - 1n;
      const roundInfo = await contracts.lottery.lotteryRound(previousRoundId);

      // 验证奖金金额是原始收益金额（费用在claimPrize时扣除）
      const totalYield = ethers.parseEther("0.1");
      expect(roundInfo.prizeValue).to.equal(totalYield);
    });
  });
});