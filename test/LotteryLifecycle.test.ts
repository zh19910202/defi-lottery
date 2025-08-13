import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { setupTest } from "./utils/setup";
import { TestContracts, TestAccounts } from "./utils/setup";

describe("彩票系统生命周期简化测试", function () {
  // 测试将花费相当长的时间
  this.timeout(100000);

  let contracts: TestContracts;
  let accounts: TestAccounts;

  beforeEach(async function () {
    const setup = await setupTest();
    contracts = setup.contracts;
    accounts = setup.accounts;
  });

  it("完整生命周期测试: 完全手动更新合约状态", async function () {
    // 用户存款
    const depositAmount = ethers.parseEther("0.5"); // 0.5 ETH worth

    // 用户1存款
    await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
    await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

    // 用户2存款  
    await contracts.usdc.connect(accounts.users[1]).approve(await contracts.vault.getAddress(), depositAmount);
    await contracts.vault.connect(accounts.users[1]).deposit(depositAmount);

    // 检查存款是否成功
    const user1Deposit = await contracts.vault.userDeposits(accounts.users[0].address);
    const user2Deposit = await contracts.vault.userDeposits(accounts.users[1].address);
    
    expect(user1Deposit.amount).to.equal(depositAmount);
    expect(user2Deposit.amount).to.equal(depositAmount);

    // 模拟收益聚合器产生收益
    const yieldAmount = ethers.parseEther("1.1"); // 1.1 ETH总余额 (包含1.0存款 + 0.1收益)
    await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);

    // 快进时间到达开奖时间
    const nextDrawTime = await contracts.lottery.nextDrawTimestamp();
    await time.increaseTo(nextDrawTime);

    // 检查是否可以开奖
    const [upkeepNeeded] = await contracts.lottery.checkUpkeep("0x");
    expect(upkeepNeeded).to.be.true;

    // 执行开奖
    await contracts.lottery.performUpkeep("0x");

    // 模拟VRF回调
    const requestId = 1;
    const randomWords = [123456789];
    await contracts.vrfCoordinator.fulfillRandomWords(requestId, await contracts.lottery.getAddress(), randomWords);

    // 检查是否有获奖者
    const currentRoundId = await contracts.lottery.getCurrentRoundId();
    const previousRoundId = currentRoundId - 1n;
    const roundInfo = await contracts.lottery.lotteryRound(previousRoundId);
    
    expect(roundInfo.winner).to.not.equal(ethers.ZeroAddress);
    console.log("获奖者:", roundInfo.winner);
  });
});