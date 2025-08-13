import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";

// 由于typechain类型问题，暂时使用Contract类型
export interface TestContracts {
  lottery: Contract;
  vault: Contract;
  prizePool: Contract;
  yieldAggregator: Contract;
  lotteryRouter: Contract;
  usdc: Contract;
  vrfCoordinator: Contract;
  comet: Contract;
}

export interface TestAccounts {
  owner: HardhatEthersSigner;
  users: HardhatEthersSigner[];
}

export async function setupTest(): Promise<{
  contracts: TestContracts;
  accounts: TestAccounts;
}> {
  // 获取测试账户
  const [owner, ...users] = await ethers.getSigners();

  // 部署模拟合约
  const MockERC20Factory = await ethers.getContractFactory(
    "contracts/test/MockERC20.sol:MockERC20",
  );
  const usdc = await MockERC20Factory.deploy("Test WETH", "TWETH", 18);
  await usdc.waitForDeployment();

  const MockVRFCoordinatorFactory = await ethers.getContractFactory("MockVRFCoordinatorV2");
  const vrfCoordinator = await MockVRFCoordinatorFactory.deploy();
  await vrfCoordinator.waitForDeployment();

  const MockCometFactory = await ethers.getContractFactory(
    "contracts/test/MockComet.sol:MockComet",
  );
  const comet = await MockCometFactory.deploy();
  await comet.waitForDeployment();

  // 部署主要合约
  const LotteryFactory = await ethers.getContractFactory("Lottery");
  const lottery = await LotteryFactory.deploy(
    await vrfCoordinator.getAddress(),
    1, // subscriptionId
    "0x0000000000000000000000000000000000000000000000000000000000000000", // keyHash
    false, // enableNativePayment
  );
  await lottery.waitForDeployment();

  const PrizePool = await ethers.getContractFactory("PrizePool");
  const prizePool = await PrizePool.deploy(
    await lottery.getAddress(),
    500, // 5% fee rate
  );
  await prizePool.waitForDeployment();

  const Vault = await ethers.getContractFactory("Vault");
  const vault = await Vault.deploy();
  await vault.waitForDeployment();

  const YieldAggregatorFactory = await ethers.getContractFactory("YieldAggregator");
  const yieldAggregator = await YieldAggregatorFactory.deploy(
    await usdc.getAddress(),
    await vault.getAddress(),
    await prizePool.getAddress(),
    await comet.getAddress(),
  );
  await yieldAggregator.waitForDeployment();

  await lottery.setPrizePool(await prizePool.getAddress());
  await lottery.setVault(await vault.getAddress());

  await prizePool.setVault(await vault.getAddress());
  await prizePool.setYieldAggregator(await yieldAggregator.getAddress());
  await prizePool.setWETH(await usdc.getAddress()); // 在测试中使用USDC作为WETH

  await vault.setYieldAggregator(await yieldAggregator.getAddress());
  await vault.setWETH(await usdc.getAddress()); // 在测试中使用USDC作为WETH
  await vault.setLottery(await lottery.getAddress());

  // 部署并设置VaultShareToken
  const VaultShareTokenFactory = await ethers.getContractFactory("VaultShareToken");
  const vaultShareToken = await VaultShareTokenFactory.deploy("Vault Share Token", "VST");
  await vaultShareToken.waitForDeployment();
  await vault.setShareToken(await vaultShareToken.getAddress());
  await vaultShareToken.setVault(await vault.getAddress());

  // 部署LotteryRouter
  const LotteryRouterFactory = await ethers.getContractFactory("LotteryRouter");
  const lotteryRouter = await LotteryRouterFactory.deploy();
  await lotteryRouter.waitForDeployment();

  // 配置LotteryRouter
  await lotteryRouter.setLottery(await lottery.getAddress());
  await lotteryRouter.setVault(await vault.getAddress());
  await lotteryRouter.setPrizePool(await prizePool.getAddress());
  await lotteryRouter.setShareToken(await vaultShareToken.getAddress());

  // 为测试账户铸造USDC (使用18位精度以匹配ETH)
  const amount = ethers.parseEther("10"); // 10 ETH worth of tokens
  for (const user of [owner, ...users]) {
    await usdc.mint(user.address, amount);
    await usdc.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);
  }

  return {
    contracts: {
      lottery,
      vault,
      prizePool,
      yieldAggregator,
      lotteryRouter,
      usdc,
      vrfCoordinator,
      comet,
    },
    accounts: {
      owner,
      users,
    },
  };
}
