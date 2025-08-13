import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTest } from "./utils/setup";
import { TestContracts, TestAccounts } from "./utils/setup";

describe("Lottery", function () {
  let contracts: TestContracts;
  let accounts: TestAccounts;

  beforeEach(async function () {
    const setup = await setupTest();
    contracts = setup.contracts;
    accounts = setup.accounts;
  });

  describe("Deployment", function () {
    it("Should set the right addresses and initial values", async function () {
      const { contracts } = await setupTest();
      const lottery = contracts.lottery;

      expect(await lottery.currentRoundId()).to.equal(0);
      expect(await lottery.nextDrawTimestamp()).to.be.greaterThan(0);
    });
  });

  describe("Lottery Operations", function () {
    beforeEach(async function () {
      // 用户存款以满足最小奖池要求
      const depositAmount = ethers.parseEther("0.5"); // 0.5 ETH worth
      await contracts.usdc
        .connect(accounts.users[0])
        .approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);
      expect(await contracts.vault.getDepositTotal()).to.equal(depositAmount);
    });

    it("Should trigger lottery when conditions are met", async function () {
      // 模拟收益聚合器产生收益 - 设置余额大于用户存款以避免下溢
      const userDeposit = ethers.parseEther("0.5"); // 用户存款
      const yieldAmount = ethers.parseEther("0.6"); // 0.6 ETH总余额 (包含0.5存款 + 0.1收益)
      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);
      
      // 增加时间以满足开奖间隔
      await time.increase(31 * 24 * 3600); // 31天

      // 检查是否满足开奖条件
      const [upkeepNeeded] = await contracts.lottery.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.true;

      // 执行开奖
      await expect(contracts.lottery.performUpkeep("0x"))
        .to.emit(contracts.lottery, "LotteryTriggered")
        .withArgs(anyValue, 0);
    });

    it("Should select winner correctly when VRF callback is received", async function () {
      // 模拟收益聚合器产生收益 - 设置余额大于用户存款以避免下溢
      const userDeposit = ethers.parseEther("0.5"); // 用户存款
      const yieldAmount = ethers.parseEther("0.6"); // 0.6 ETH总余额 (包含0.5存款 + 0.1收益)
      await contracts.comet.setBalance(await contracts.yieldAggregator.getAddress(), yieldAmount);
      
      // 增加时间并触发开奖
      await time.increase(31 * 24 * 3600);
      await contracts.lottery.performUpkeep("0x");

      // 模拟 VRF 回调
      const requestId = 1;
      const randomWords = [ethers.toBigInt("123456")];
      const currentRoundId = await contracts.lottery.getCurrentRoundId();
      
      await expect(
        contracts.vrfCoordinator.fulfillRandomWords(
          requestId,
          await contracts.lottery.getAddress(),
          randomWords,
        ),
      )
        .to.emit(contracts.lottery, "WinnerSelected")
        .withArgs(accounts.users[0].address, anyValue, currentRoundId);

      // 验证中奖信息
      const lotteryInfo = await contracts.lottery.lotteryRound(0);
      expect(lotteryInfo.winner).to.equal(accounts.users[0].address);
      expect(lotteryInfo.isClaimed).to.be.false;
    });

    it("Should not trigger lottery before minimum interval", async function () {
      await time.increase(3 * 24 * 3600); // 只过了3天
      const [upkeepNeeded] = await contracts.lottery.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.false;
      await expect(contracts.lottery.performUpkeep("0x")).to.be.revertedWith("Upkeep not needed");
    });

    it("Should not trigger lottery without minimum prize pool", async function () {
      const depositAmount = ethers.parseEther("0.5"); // 0.5 ETH worth
      // 先清空奖池 - 用户提取存款
      const shareTokenAddress = await contracts.vault.getShareToken();
      const shareTokenContract = await ethers.getContractAt("VaultShareToken", shareTokenAddress);
      await shareTokenContract.connect(accounts.users[0]).approve(await contracts.vault.getAddress(), depositAmount);
      await contracts.vault.connect(accounts.users[0])["withdraw()"]();

      await time.increase(7 * 24 * 3600);
      const [upkeepNeeded] = await contracts.lottery.checkUpkeep("0x");
      expect(upkeepNeeded).to.be.false;
      await expect(contracts.lottery.performUpkeep("0x")).to.be.revertedWith("Upkeep not needed");
    });
  });
});
