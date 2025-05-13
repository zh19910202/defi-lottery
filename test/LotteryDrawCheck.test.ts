import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Lottery Draw Check", function () {
  let lottery: Contract;
  let vault: Contract;
  let prizePool: Contract;
  let yieldAggregator: Contract;
  let weth: Contract;
  let vaultShareToken: Contract;
  let router: Contract;
  let vrfCoordinator: Contract;
  let owner: Signer;
  let user1: Signer;
  let user2: Signer;
  let ownerAddress: string;
  let user1Address: string;
  let user2Address: string;

  beforeEach(async function () {
    // 获取签名者账户
    [owner, user1, user2] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    user1Address = await user1.getAddress();
    user2Address = await user2.getAddress();

    // 部署测试用WETH合约
    const WETH = await ethers.getContractFactory("WETH9");
    weth = await WETH.deploy();
    await weth.waitForDeployment();

    // 部署Mock VRF Coordinator
    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinatorV2");
    vrfCoordinator = await MockVRFCoordinator.deploy();
    await vrfCoordinator.waitForDeployment();

    // 部署VaultShareToken
    const VaultShareToken = await ethers.getContractFactory("VaultShareToken");
    vaultShareToken = await VaultShareToken.deploy("Vault Share Token", "VST");
    await vaultShareToken.waitForDeployment();

    // 部署YieldAggregator
    const YieldAggregator = await ethers.getContractFactory("YieldAggregator");
    yieldAggregator = await YieldAggregator.deploy(await weth.getAddress());
    await yieldAggregator.waitForDeployment();

    // 部署PrizePool
    const PrizePool = await ethers.getContractFactory("PrizePool");
    prizePool = await PrizePool.deploy(await weth.getAddress());
    await prizePool.waitForDeployment();

    // 部署Vault（使用ConcreteVault）
    const Vault = await ethers.getContractFactory("ConcreteVault");
    vault = await Vault.deploy();
    await vault.waitForDeployment();
    await vault.initialize();
    await vault.setShareToken(await vaultShareToken.getAddress());
    await vault.setWETH(await weth.getAddress());
    await vault.setYieldAggregator(await yieldAggregator.getAddress());
    await vault.setPrizePool(await prizePool.getAddress());

    // 部署Lottery
    const Lottery = await ethers.getContractFactory("Lottery");
    lottery = await Lottery.deploy(
      await vrfCoordinator.getAddress(),
      1, // subscriptionId
      "0x0000000000000000000000000000000000000000000000000000000000000000", // keyHash
    );
    await lottery.waitForDeployment();

    // 部署Router
    const LotteryRouter = await ethers.getContractFactory("LotteryRouter");
    router = await LotteryRouter.deploy();
    await router.waitForDeployment();

    // 设置组件之间的关系
    await vault.setLottery(await lottery.getAddress());
    await lottery.setVault(await vault.getAddress());
    await lottery.setPrizePool(await prizePool.getAddress());
    await prizePool.setLottery(await lottery.getAddress());
    await router.setLottery(await lottery.getAddress());
    await router.setVault(await vault.getAddress());
    await router.setPrizePool(await prizePool.getAddress());
    await vault.setRouter(await router.getAddress());
    await lottery.setRouter(await router.getAddress());
  });

  async function depositAndParticipate() {
    // 用户存款
    const depositAmount = ethers.parseEther("0.5");

    // 用户1获取WETH并存款
    await weth.connect(user1).deposit({ value: depositAmount });
    await weth.connect(user1).approve(vault.getAddress(), depositAmount);
    await vault.connect(user1).deposit(depositAmount);

    // 用户2获取WETH并存款
    await weth.connect(user2).deposit({ value: depositAmount });
    await weth.connect(user2).approve(vault.getAddress(), depositAmount);
    await vault.connect(user2).deposit(depositAmount);

    // 给奖池添加奖金
    const prizeAmount = ethers.parseEther("0.1");
    await weth.deposit({ value: prizeAmount });
    await weth.approve(prizePool.getAddress(), prizeAmount);
    await prizePool.addPrize(prizeAmount);

    // 快进时间到达开奖时间
    const nextDrawTime = await lottery.nextDrawTimestamp();
    await time.increaseTo(nextDrawTime);
  }

  it("Should not allow drawing a lottery twice", async function () {
    // 存款并参与彩票
    await depositAndParticipate();

    // 检查是否符合开奖条件
    const [upkeepNeeded] = await lottery.checkUpkeep("0x");
    expect(upkeepNeeded).to.be.true;

    // 执行第一次开奖
    await lottery.performUpkeep("0x");

    // 模拟Chainlink VRF回调
    const requestId = 1;
    const randomWords = [123456789];
    await vrfCoordinator.fulfillRandomWords(requestId, await lottery.getAddress(), randomWords);

    // 检查轮次是否已开奖
    const currentRoundId = await lottery.getCurrentRoundId();
    const previousRoundId = currentRoundId - 1n;
    expect(await lottery.isRoundDrawn(previousRoundId)).to.be.true;

    // 尝试再次执行开奖检查 - 因为新轮次刚开始，所以条件不满足
    const [upkeepNeededAfter] = await lottery.checkUpkeep("0x");
    expect(upkeepNeededAfter).to.be.false;

    // 进入下一轮 - 设置一个赢家但不开始新轮次
    await lottery.setWinner(previousRoundId, user1Address);

    // 尝试再次对已开奖的轮次执行开奖
    // 我们需要直接调用performUpkeep，因为checkUpkeep不会通过
    await lottery.performUpkeep("0x");

    // 检查是否触发了LotteryAlreadyDrawn事件
    const filter = lottery.filters.LotteryAlreadyDrawn(previousRoundId);
    const events = await lottery.queryFilter(filter);
    expect(events.length).to.be.greaterThan(0);
  });

  it("Should check if a round is drawn correctly", async function () {
    // 初始轮次应该没有开奖
    expect(await lottery.isRoundDrawn(0)).to.be.false;

    // 存款并参与彩票
    await depositAndParticipate();

    // 执行开奖
    await lottery.performUpkeep("0x");

    // 模拟Chainlink VRF回调
    const requestId = 1;
    const randomWords = [123456789];
    await vrfCoordinator.fulfillRandomWords(requestId, await lottery.getAddress(), randomWords);

    // 检查轮次是否已开奖
    const previousRoundId = 0;
    expect(await lottery.isRoundDrawn(previousRoundId)).to.be.true;

    // 检查新轮次是否未开奖
    const currentRoundId = await lottery.getCurrentRoundId();
    expect(await lottery.isRoundDrawn(currentRoundId)).to.be.false;
  });
});
