import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";

describe("LotterySystemDeploymentTest", function () {
  let factory: Contract;
  let owner: Signer, user1: Signer, user2: Signer;
  let ownerAddress: string, user1Address: string, user2Address: string;

  // 模拟的Chainlink和Compound地址
  const vrfCoordinator = "0x271682DEB8C4E0901D1a1550aD2e64D568E69909"; // 假设的VRF协调器地址
  const subscriptionId = 1234;
  const keyHash = "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef";
  const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC代币地址
  const cometAddress = "0xc3d688B66703497DAA19211EEdff47f25384cdc3"; // Compound V3 Comet地址

  // 系统组件地址
  let vaultAddress: string,
    lotteryAddress: string,
    prizePoolAddress: string,
    routerAddress: string,
    yieldAggregatorAddress: string;

  beforeEach(async function () {
    // 获取测试账户
    [owner, user1, user2] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    user1Address = await user1.getAddress();
    user2Address = await user2.getAddress();

    // 部署LotteryFactory合约
    const LotteryFactory = await ethers.getContractFactory("LotteryFactory");
    factory = await LotteryFactory.deploy();
    // 等待部署完成
    await factory.waitForDeployment();

    // 部署整个系统
    await factory.deploySystem(vrfCoordinator, subscriptionId, keyHash, usdcAddress, cometAddress);

    // 等待部署事务完成
    const tx = await factory.deploySystem(
      vrfCoordinator,
      subscriptionId,
      keyHash,
      usdcAddress,
      cometAddress,
    );
    await tx.wait();

    // 获取各组件地址
    vaultAddress = await factory.vault();
    lotteryAddress = await factory.lottery();
    prizePoolAddress = await factory.prizePool();
    routerAddress = await factory.router();
    yieldAggregatorAddress = await factory.yieldAggregator();
  });

  describe("BasicDeploymentTests", function () {
    it("should deploy all components successfully", async function () {
      expect(vaultAddress).to.not.equal(ethers.constants.AddressZero);
      expect(lotteryAddress).to.not.equal(ethers.constants.AddressZero);
      expect(prizePoolAddress).to.not.equal(ethers.constants.AddressZero);
      expect(routerAddress).to.not.equal(ethers.constants.AddressZero);
      expect(yieldAggregatorAddress).to.not.equal(ethers.constants.AddressZero);
    });

    it("should transfer ownership to deployer", async function () {
      const Lottery = await ethers.getContractFactory("Lottery");
      const LotteryRouter = await ethers.getContractFactory("LotteryRouter");
      const YieldAggregator = await ethers.getContractFactory("YieldAggregator");

      const lottery = Lottery.attach(lotteryAddress);
      const router = LotteryRouter.attach(routerAddress);
      const yieldAggregator = YieldAggregator.attach(yieldAggregatorAddress);

      expect(await lottery.owner()).to.equal(ownerAddress);
      expect(await router.owner()).to.equal(ownerAddress);
      expect(await yieldAggregator.owner()).to.equal(ownerAddress);
    });
  });

  describe("ComponentRelationshipTests", function () {
    it("should configure Router correctly", async function () {
      const LotteryRouter = await ethers.getContractFactory("LotteryRouter");
      const router = LotteryRouter.attach(routerAddress);

      expect(await router.lottery()).to.equal(lotteryAddress);
      expect(await router.vault()).to.equal(vaultAddress);
      expect(await router.prizePool()).to.equal(prizePoolAddress);
    });

    it("should configure Vault correctly", async function () {
      const Vault = await ethers.getContractFactory("Vault");
      const vault = Vault.attach(vaultAddress);

      expect(await vault.lottery()).to.equal(lotteryAddress);
      expect(await vault.router()).to.equal(routerAddress);
      expect(await vault.yieldAggregator()).to.equal(yieldAggregatorAddress);
    });

    it("should configure Lottery correctly", async function () {
      const Lottery = await ethers.getContractFactory("Lottery");
      const lottery = Lottery.attach(lotteryAddress);

      expect(await lottery.vault()).to.equal(vaultAddress);
      expect(await lottery.prizePool()).to.equal(prizePoolAddress);
      expect(await lottery.router()).to.equal(routerAddress);
    });
  });

  describe("FunctionalIntegrationTests", function () {
    it("should allow users to deposit through Router", async function () {
      const LotteryRouter = await ethers.getContractFactory("LotteryRouter");
      const Vault = await ethers.getContractFactory("Vault");

      const router = LotteryRouter.attach(routerAddress);
      const vault = Vault.attach(vaultAddress);

      // 用户1通过Router存款
      const depositAmount = ethers.utils.parseEther("0.5"); // 0.5 ETH
      await router.connect(user1).deposit({ value: depositAmount });

      // 检查用户1的存款是否正确记录
      const deposit = await vault.userDeposits(user1Address);
      expect(deposit.amount).to.equal(depositAmount);
    });

    it("should allow YieldAggregator to receive deposits", async function () {
      const LotteryRouter = await ethers.getContractFactory("LotteryRouter");
      const YieldAggregator = await ethers.getContractFactory("YieldAggregator");

      const router = LotteryRouter.attach(routerAddress);
      const yieldAggregator = YieldAggregator.attach(yieldAggregatorAddress);

      // 用户1通过Router存款
      const depositAmount = ethers.utils.parseEther("0.5"); // 0.5 ETH

      // 模拟YieldAggregator的deposit函数，跟踪它是否被调用
      await expect(router.connect(user1).deposit({ value: depositAmount })).to.emit(
        yieldAggregator,
        "Deposited",
      );
    });

    it("should allow users to withdraw", async function () {
      const LotteryRouter = await ethers.getContractFactory("LotteryRouter");
      const Vault = await ethers.getContractFactory("Vault");

      const router = LotteryRouter.attach(routerAddress);
      const vault = Vault.attach(vaultAddress);

      // 用户1先存款
      const depositAmount = ethers.utils.parseEther("0.5"); // 0.5 ETH
      await router.connect(user1).deposit({ value: depositAmount });

      // 然后提款
      await router.connect(user1).withdraw();

      // 检查用户1的存款是否已清零
      const deposit = await vault.userDeposits(user1Address);
      expect(deposit.amount).to.equal(0);
    });
  });
});
