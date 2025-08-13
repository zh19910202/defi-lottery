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

      expect(await prizePool.lottery()).to.equal(await lottery.getAddress());
      expect(await prizePool.yieldAggregator()).to.equal(await contracts.yieldAggregator.getAddress());
      expect(await prizePool.vault()).to.equal(await contracts.vault.getAddress());
      expect(await prizePool.getPrizePoolAmount()).to.equal(0);
    });
  });

  describe("Deposits", function () {
    it("Should accept deposits through vault", async function () {
      const depositAmount = ethers.parseEther("0.5"); // 0.5 ETH worth
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      expect(await contracts.vault.getDepositTotal()).to.equal(depositAmount);
    });

    it("Should emit Deposited event", async function () {
      const depositAmount = ethers.parseEther("0.5"); // 0.5 ETH worth
      const tx = await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);

      await expect(tx)
        .to.emit(contracts.vault, "Deposited")
        .withArgs(accounts.users[0].address, depositAmount, anyValue, anyValue);
    });

    it("Should revert when deposit amount is zero", async function () {
      await expect(contracts.vault.connect(accounts.users[0]).deposit(0)).to.be.revertedWith(
        "Min deposit 0.1 ETH",
      );
    });
  });

  describe("Withdrawals", function () {
    const depositAmount = ethers.parseEther("0.5"); // 0.5 ETH worth

    beforeEach(async function () {
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);
    });

    it("Should allow withdrawals through vault", async function () {
      const balanceBefore = await contracts.usdc.balanceOf(accounts.users[0].address);
      
      // 获取share token地址并approve
      const shareTokenAddress = await contracts.vault.getShareToken();
      const shareTokenContract = await ethers.getContractAt("VaultShareToken", shareTokenAddress);
      await shareTokenContract.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);

      await contracts.vault.connect(accounts.users[0])["withdraw()"]();

      const balanceAfter = await contracts.usdc.balanceOf(accounts.users[0].address);
      expect(balanceAfter - balanceBefore).to.equal(depositAmount);
    });

    it("Should emit Withdrawn event", async function () {
      // 获取share token地址并approve
      const shareTokenAddress = await contracts.vault.getShareToken();
      const shareTokenContract = await ethers.getContractAt("VaultShareToken", shareTokenAddress);
      await shareTokenContract.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);

      const tx = await contracts.vault.connect(accounts.users[0])["withdraw()"]();

      await expect(tx)
        .to.emit(contracts.vault, "Withdrawn")
        .withArgs(accounts.users[0].address, depositAmount, anyValue, anyValue);
    });

    it("Should revert when user has no deposit", async function () {
      // 先提取所有资金
      const shareTokenAddress = await contracts.vault.getShareToken();
      const shareTokenContract = await ethers.getContractAt("VaultShareToken", shareTokenAddress);
      await shareTokenContract.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[0])["withdraw()"]();
      
      // 再次尝试提取应该失败
      await expect(contracts.vault.connect(accounts.users[0])["withdraw()"]()).to.be.reverted;
    });
  });

  describe("Prize Distribution", function () {
    const depositAmount = ethers.parseEther("0.5"); // 0.5 ETH worth

    beforeEach(async function () {
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);
    });

    it("Should allow prize distribution through lottery", async function () {
      // 模拟收益聚合器产生收益
      const yieldAmount = ethers.parseEther("0.6"); // 0.6 ETH总余额 (包含0.5存款 + 0.1收益)
      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);
      
      // 增加时间以满足开奖间隔
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 3600]); // 31天
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
