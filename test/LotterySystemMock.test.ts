import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";

describe("LotterySystemMockTest", function () {
  let factory: Contract;
  let owner: any, user1: any, user2: any;
  let ownerAddress: string, user1Address: string, user2Address: string;

  // 模拟合约
  let mockVRFCoordinator: Contract;
  let mockUSDC: Contract;
  let mockComet: Contract;

  // 系统组件
  let vault: Contract;
  let lottery: Contract;
  let prizePool: Contract;
  let router: Contract;
  let yieldAggregator: Contract;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    user1Address = await user1.getAddress();
    user2Address = await user2.getAddress();

    // 部署模拟合约
    const MockVRFCoordinator = await ethers.getContractFactory(
      "contracts/test/MockVRFCoordinator.sol:MockVRFCoordinator",
    );
    mockVRFCoordinator = await MockVRFCoordinator.deploy();
    await mockVRFCoordinator.waitForDeployment();

    const MockERC20 = await ethers.getContractFactory("contracts/test/MockERC20.sol:MockERC20");
    mockUSDC = await MockERC20.deploy("USDC", "USDC", 6);
    await mockUSDC.waitForDeployment();

    const MockComet = await ethers.getContractFactory("contracts/test/MockComet.sol:MockComet");
    mockComet = await MockComet.deploy();
    await mockComet.waitForDeployment();

    // 部署LotteryFactory
    const LotteryFactory = await ethers.getContractFactory("LotteryFactory");
    factory = await LotteryFactory.deploy();
    await factory.waitForDeployment();

    // 部署系统
    const subscriptionId = 1234;
    const keyHash = "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef"; // 使用正确的keyHash格式
    await factory.deploySystem(
      await mockVRFCoordinator.getAddress(),
      subscriptionId,
      keyHash,
      await mockUSDC.getAddress(),
      await mockComet.getAddress(),
    );

    // 获取组件
    const Vault = await ethers.getContractFactory("Vault");
    const Lottery = await ethers.getContractFactory("Lottery");
    const PrizePool = await ethers.getContractFactory("PrizePool");
    const LotteryRouter = await ethers.getContractFactory("LotteryRouter");
    const YieldAggregator = await ethers.getContractFactory("YieldAggregator");

    vault = Vault.attach(await factory.vault());
    lottery = Lottery.attach(await factory.lottery());
    prizePool = PrizePool.attach(await factory.prizePool());
    router = LotteryRouter.attach(await factory.router());
    yieldAggregator = YieldAggregator.attach(await factory.yieldAggregator());
  });

  it("should allow user deposits", async function () {
    // 用户1存款 0.5 ETH
    const depositAmount = ethers.parseEther("0.5");

    // 我们需要先转一些ETH到模拟的YieldAggregator合约，模拟它能够收到存款并返回资金
    await owner.sendTransaction({
      to: await yieldAggregator.getAddress(),
      value: ethers.parseEther("10.0"), // 10 ETH足够测试
    });

    // 用户1通过Router存款
    await router.connect(user1).deposit({ value: depositAmount });

    // 验证存款记录
    const userDeposit = await vault.userDeposits(user1Address);
    expect(userDeposit.amount).to.equal(depositAmount);

    // 检查用户总数
    expect(await vault.getUserCount()).to.equal(1);
  });

  it("should start a new round", async function () {
    // 模拟Chainlink Automation调用
    await lottery.performUpkeep("0x");

    // 验证当前轮次ID已更新
    expect(await lottery.currentRoundId()).to.equal(1);
  });

  it("should run the entire lottery flow", async function () {
    // 给YieldAggregator一些初始资金
    await owner.sendTransaction({
      to: await yieldAggregator.getAddress(),
      value: ethers.parseEther("10.0"),
    });

    // 用户1和用户2存款
    await router.connect(user1).deposit({ value: ethers.parseEther("0.5") });
    await router.connect(user2).deposit({ value: ethers.parseEther("0.7") });

    // 模拟时间经过一段时间后，触发开奖
    await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // 30天
    await ethers.provider.send("evm_mine", []);

    // 触发开奖
    await lottery.performUpkeep("0x");

    // 假设mockVRFCoordinator会设置user1为获胜者
    // 生成一个随机值
    const randomValue = ethers.hexlify(ethers.randomBytes(32));
    await mockVRFCoordinator.fulfillRandomWords(0, await lottery.getAddress(), [randomValue]);

    // 手动设置获胜者为user1（模拟）
    if ((await lottery.owner()) === ownerAddress) {
      await lottery.setWinner(0, user1Address);
    }

    // 验证user1是获胜者
    const round = await lottery.lotteryRound(0);
    expect(round.winner).to.equal(user1Address);

    // user1领取奖金
    await router.connect(user1).claimPrize(0);

    // 验证奖金已领取
    const updatedRound = await lottery.lotteryRound(0);
    expect(updatedRound.isClaimed).to.be.true;
  });
});
