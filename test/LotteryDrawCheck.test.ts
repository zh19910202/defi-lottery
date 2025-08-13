import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { setupTest } from "./utils/setup";
import { TestContracts, TestAccounts } from "./utils/setup";

describe("Lottery Draw Check", function () {
  let contracts: TestContracts;
  let accounts: TestAccounts;

  beforeEach(async function () {
    const setup = await setupTest();
    contracts = setup.contracts;
    accounts = setup.accounts;
  });

  async function depositAndParticipate() {
    // 用户存款 - 使用18位精度的测试代币
    const depositAmount = ethers.parseEther("0.5"); // 0.5 ETH worth

    // 用户1存款
    await contracts.usdc.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
    await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

    // 用户2存款  
    await contracts.usdc.connect(accounts.users[1]).approve(await contracts.vault.getAddress(), depositAmount);
    await contracts.vault.connect(accounts.users[1]).deposit(depositAmount);

    // 模拟收益聚合器产生收益
    const yieldAmount = ethers.parseEther("1.1"); // 1.1 ETH总余额 (包含1.0存款 + 0.1收益)
    await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);

    // 快进时间到达开奖时间
    const nextDrawTime = await contracts.lottery.nextDrawTimestamp();
    await time.increaseTo(nextDrawTime);
  }

  it("Should not allow drawing a lottery twice", async function () {
    // 存款并参与彩票
    await depositAndParticipate();

    // 检查是否符合开奖条件
    const [upkeepNeeded] = await contracts.lottery.checkUpkeep("0x");
    expect(upkeepNeeded).to.be.true;

    // 执行第一次开奖
    await contracts.lottery.performUpkeep("0x");

    // 模拟Chainlink VRF回调
    const requestId = 1;
    const randomWords = [123456789];
    await contracts.vrfCoordinator.fulfillRandomWords(requestId, await contracts.lottery.getAddress(), randomWords);

    // 检查轮次是否已开奖
    const currentRoundId = await contracts.lottery.getCurrentRoundId();
    const previousRoundId = currentRoundId - 1n;
    expect(await contracts.lottery.isRoundDrawn(previousRoundId)).to.be.true;

    // 尝试再次执行开奖检查 - 因为新轮次刚开始，所以条件不满足
    const [upkeepNeededAfter] = await contracts.lottery.checkUpkeep("0x");
    expect(upkeepNeededAfter).to.be.false;
  });

  it("Should check if a round is drawn correctly", async function () {
    // 初始轮次应该没有开奖
    expect(await contracts.lottery.isRoundDrawn(0)).to.be.false;

    // 存款并参与彩票
    await depositAndParticipate();

    // 执行开奖
    await contracts.lottery.performUpkeep("0x");

    // 模拟Chainlink VRF回调
    const requestId = 1;
    const randomWords = [123456789];
    await contracts.vrfCoordinator.fulfillRandomWords(requestId, await contracts.lottery.getAddress(), randomWords);

    // 检查轮次是否已开奖
    const previousRoundId = 0;
    expect(await contracts.lottery.isRoundDrawn(previousRoundId)).to.be.true;

    // 检查新轮次是否未开奖
    const currentRoundId = await contracts.lottery.getCurrentRoundId();
    expect(await contracts.lottery.isRoundDrawn(currentRoundId)).to.be.false;
  });
});
