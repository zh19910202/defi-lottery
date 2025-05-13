import { expect } from "chai";
import { ethers } from "hardhat";
import { setupTest } from "./utils/setup";
import { TestContracts, TestAccounts } from "./utils/setup";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("YieldAggregator", function () {
  let contracts: TestContracts;
  let accounts: TestAccounts;

  beforeEach(async function () {
    const setup = await setupTest();
    contracts = setup.contracts;
    accounts = setup.accounts;
  });

  describe("Deployment", function () {
    it("Should set the right token addresses and initial state", async function () {
      const yieldAggregator = contracts.yieldAggregator;
      const usdc = contracts.usdc;
      const vault = contracts.vault;
      const prizePool = contracts.prizePool;

      expect(await yieldAggregator.usdc()).to.equal(await usdc.getAddress());
      expect(await yieldAggregator.vault()).to.equal(await vault.getAddress());
      expect(await yieldAggregator.prizePool()).to.equal(await prizePool.getAddress());
      expect(await contracts.yieldAggregator.comet()).to.equal(await contracts.comet.getAddress());
      describe("Compound Integration", function () {
        const depositAmount = ethers.parseUnits("100", 6);

        it("Should supply USDC to Compound when depositing through Vault", async function () {
          await contracts.vault.connect(accounts.users[0]).deposit(depositAmount);
          // 验证 Compound 中的余额
          expect(
            (await contracts.comet.userBasic(await contracts.yieldAggregator.getAddress()))
              .principal,
          ).to.equal(depositAmount);
        });

        it("Should withdraw USDC from Compound when withdrawing through Vault", async function () {
          const withdrawAmount = ethers.parseUnits("50", 6);
          await contracts.vault.connect(accounts.users[0]).withdraw(withdrawAmount);

          // 验证 Compound 中的余额减少
          expect(
            (await contracts.comet.userBasic(await contracts.yieldAggregator.getAddress()))
              .principal,
          ).to.equal(depositAmount - withdrawAmount);
        });
      });
    });
  });
});
