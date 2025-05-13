import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("彩票系统生命周期简化测试", function () {
  // 测试将花费相当长的时间
  this.timeout(100000);

  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;

  // 合约实例
  let lottery: Contract;
  let vault: Contract;
  let prizePool: Contract;
  let router: Contract;
  let yieldAggregator: Contract;
  let weth: Contract;
  let mockVRFCoordinator: Contract;
  let mockComet: Contract;

  // 地址
  let ownerAddress: string;
  let user1Address: string;
  let user2Address: string;
  let user3Address: string;

  // 设置常量
  const SUBSCRIPTION_ID = 1234;
  const KEY_HASH = "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef";
  const MIN_DEPOSIT = ethers.parseEther("0.1"); // 0.1 ETH
  const DEPOSIT_AMOUNT = ethers.parseEther("0.5"); // 0.5 ETH
  const DRAW_INTERVAL = 30 * 24 * 60 * 60; // 30天，与合约中的常量保持一致

  async function timeTravel(seconds: number) {
    await time.increase(seconds);
  }

  before(async function () {
    // 获取签名者
    [owner, user1, user2, user3] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    user1Address = await user1.getAddress();
    user2Address = await user2.getAddress();
    user3Address = await user3.getAddress();

    console.log("部署模拟合约...");

    // 部署模拟VRF协调器
    const MockVRFCoordinator = await ethers.getContractFactory(
      "contracts/test/MockVRFCoordinator.sol:MockVRFCoordinator",
    );
    mockVRFCoordinator = await MockVRFCoordinator.deploy();
    await mockVRFCoordinator.waitForDeployment();

    // 部署模拟WETH
    const MockERC20 = await ethers.getContractFactory("contracts/test/MockERC20.sol:MockERC20");
    weth = await MockERC20.deploy("Wrapped ETH", "WETH", 18);
    await weth.waitForDeployment();

    // 为测试账户铸造WETH
    const wethAmount = ethers.parseEther("10"); // 每个用户10 WETH
    for (const user of [owner, user1, user2, user3]) {
      await weth.mint(await user.getAddress(), wethAmount);
    }

    // 部署模拟Comet
    const MockComet = await ethers.getContractFactory("contracts/test/MockComet.sol:MockComet");
    mockComet = await MockComet.deploy();
    await mockComet.waitForDeployment();

    console.log("开始手动部署各个组件...");

    // 部署Vault
    const VaultFactory = await ethers.getContractFactory("Vault");
    vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
    await vault.initialize();

    // 部署Lottery
    const LotteryFactory = await ethers.getContractFactory("Lottery");
    lottery = await LotteryFactory.deploy(
      await mockVRFCoordinator.getAddress(),
      SUBSCRIPTION_ID,
      KEY_HASH,
    );
    await lottery.waitForDeployment();

    // 部署PrizePool
    const PrizePoolFactory = await ethers.getContractFactory("PrizePool");
    prizePool = await PrizePoolFactory.deploy(await lottery.getAddress());
    await prizePool.waitForDeployment();

    // 部署Router
    const RouterFactory = await ethers.getContractFactory("LotteryRouter");
    router = await RouterFactory.deploy();
    await router.waitForDeployment();

    // 部署YieldAggregator，但不使用它
    const YieldAggregatorFactory = await ethers.getContractFactory("YieldAggregator");
    yieldAggregator = await YieldAggregatorFactory.deploy(
      await weth.getAddress(),
      await vault.getAddress(),
      await prizePool.getAddress(),
      await mockComet.getAddress(),
    );
    await yieldAggregator.waitForDeployment();

    console.log("配置合约之间的关系...");

    // 配置路由
    await router.setLottery(await lottery.getAddress());
    await router.setVault(await vault.getAddress());
    await router.setPrizePool(await prizePool.getAddress());

    // 配置Vault - 注意，不设置yield aggregator
    await vault.setRouter(await router.getAddress());
    await vault.setLottery(await lottery.getAddress());
    // 不调用 vault.setYieldAggregator()

    // 配置Lottery
    await lottery.setRouter(await router.getAddress());
    await lottery.setVault(await vault.getAddress());
    await lottery.setPrizePool(await prizePool.getAddress());

    // 配置PrizePool - 同样不使用yield aggregator
    await prizePool.setVault(await vault.getAddress());
    // 不调用 prizePool.setYieldAggregator()

    console.log("彩票系统已部署并配置:");
    console.log(`- Vault地址: ${await vault.getAddress()}`);
    console.log(`- Lottery地址: ${await lottery.getAddress()}`);
    console.log(`- PrizePool地址: ${await prizePool.getAddress()}`);
    console.log(`- Router地址: ${await router.getAddress()}`);
    console.log(`- YieldAggregator地址: ${await yieldAggregator.getAddress()} (未连接)`);

    // 获取当前彩票轮次
    const currentRoundId = await vault.getCurrentRoundId();
    console.log(`当前彩票轮次: ${currentRoundId}`);

    // 查看下一次开奖时间
    const nextDrawTime = await lottery.nextDrawTimestamp();
    console.log(`下次开奖时间: ${new Date(Number(nextDrawTime) * 1000)}`);

    // 提前准备测试环境：直接向奖池添加足够的ETH，确保performUpkeep不会因为奖池余额不足而失败
    console.log("准备测试环境：向奖池添加ETH");
    const prizeAmount = ethers.parseEther("0.5"); // 0.5 ETH，超过MIN_PRIZE_POOL的0.1 ETH
    await prizePool.addToPrizePool({ value: prizeAmount });
    console.log(`向奖池添加了 ${ethers.formatEther(prizeAmount)} ETH`);

    // 检查奖池余额
    const poolBalance = await prizePool.getPrizePoolAmount();
    console.log(`奖池当前余额: ${ethers.formatEther(poolBalance)} ETH`);
  });

  it("完整生命周期测试: 完全手动更新合约状态", async function () {
    console.log("=== 开始完整生命周期测试 ===");

    // 获取当前轮次ID
    const currentRoundId = await vault.getCurrentRoundId();
    console.log(`当前轮次ID: ${currentRoundId}`);

    // 步骤1: 手动设置用户权重
    console.log(`步骤1: 手动设置用户权重`);

    // 更新用户1和用户2的权重
    const weight1 = 100n;
    const weight2 = 200n;

    await lottery.updateUserWeight(user1Address, weight1);
    console.log(`设置用户1 (${user1Address}) 权重为 ${weight1}`);

    await lottery.updateUserWeight(user2Address, weight2);
    console.log(`设置用户2 (${user2Address}) 权重为 ${weight2}`);

    // 步骤2: 手动设置奖池奖金 - 已在setup中完成
    console.log(`步骤2: 检查奖池奖金`);
    const poolPrizeAmount = await prizePool.getPrizePoolAmount();
    console.log(`奖池当前余额: ${ethers.formatEther(poolPrizeAmount)} ETH`);

    // 步骤3: 手动设置获奖者为用户1
    console.log(`步骤3: 手动设置用户1为获奖者`);
    await lottery.setWinner(currentRoundId, user1Address);

    // 获取彩票轮次信息
    const lotteryRound = await lottery.lotteryRound(currentRoundId);
    console.log(`轮次 ${currentRoundId} 获奖者: ${lotteryRound.winner}`);
    console.log(`奖金: ${ethers.formatEther(lotteryRound.prizeValue)} ETH`);

    // 验证获奖者是用户1
    expect(lotteryRound.winner).to.equal(user1Address);
    expect(lotteryRound.prizeValue).to.be.gt(0);

    // 步骤3.5: 时间旅行，让nextDrawTimestamp到期
    console.log(`步骤3.5: 时间旅行，模拟经过DRAW_INTERVAL时间`);
    const nextDrawTimestamp = await lottery.nextDrawTimestamp();
    console.log(`当前下次开奖时间: ${new Date(Number(nextDrawTimestamp) * 1000)}`);

    // 向前时间旅行30天
    await timeTravel(DRAW_INTERVAL + 60); // 多加60秒以确保超过
    console.log(`时间旅行完成，当前时间: ${new Date()}`);

    // 步骤4: 由router触发performUpkeep开始新的一轮
    console.log(`步骤4: 由router触发抽奖，开始新的轮次`);

    // 让VRF Coordinator模拟回调，以便在requestRandomWords后自动调用fulfillRandomWords
    await mockVRFCoordinator.setCallbackContract(await lottery.getAddress());

    // 调用router的triggerDraw
    await router.triggerDraw();

    // 验证当前轮次ID已增加
    const newRoundId = await vault.getCurrentRoundId();
    console.log(`当前轮次ID: ${newRoundId}`);

    // 验证轮次ID已增加
    expect(newRoundId).to.be.gt(currentRoundId);

    console.log("=== 测试完成 ===");
  });
});
