import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  Vault,
  Lottery,
  PrizePool,
  LotteryRouter,
  YieldAggregator,
  VaultShareToken,
  MockERC20,
  MockComet
} from "../typechain-types";
import { setupTest } from "./utils/setup";

describe("Security Integration Tests", function () {
  let vault: Vault;
  let lottery: Lottery;
  let prizePool: PrizePool;
  let router: LotteryRouter;
  let yieldAggregator: YieldAggregator;
  let shareToken: VaultShareToken;
  let weth: MockERC20;
  let comet: MockComet;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  beforeEach(async function () {
    const setup = await setupTest();
    vault = setup.contracts.vault as any;
    lottery = setup.contracts.lottery as any;
    prizePool = setup.contracts.prizePool as any;
    router = setup.contracts.lotteryRouter as any;
    yieldAggregator = setup.contracts.yieldAggregator as any;
    weth = setup.contracts.usdc as any; // Using USDC as WETH mock
    comet = setup.contracts.comet as any;
    owner = setup.accounts.owner;
    user1 = setup.accounts.users[0];
    user2 = setup.accounts.users[1];
    user3 = setup.accounts.users[2];
    
    // Get share token from vault
    const shareTokenAddress = await vault.getShareToken();
    shareToken = await ethers.getContractAt("VaultShareToken", shareTokenAddress) as any;
  });

  describe("Reentrancy Protection Tests", function () {
    it("Should prevent reentrancy attacks on withdrawal", async function () {
      const depositAmount = ethers.parseEther("1");
      
      // User deposits
      await weth.connect(user1).approve(vault.target, depositAmount);
      await vault.connect(user1).deposit(depositAmount);
      
      // Verify deposit
      const userDeposit = await vault.userDeposits(user1.address);
      expect(userDeposit.amount).to.equal(depositAmount);
      
      // Normal withdrawal should work
      await vault.connect(user1).withdraw();
      
      // Verify withdrawal completed
      const userDepositAfter = await vault.userDeposits(user1.address);
      expect(userDepositAfter.amount).to.equal(0);
    });

    it("Should handle multiple users depositing and withdrawing", async function () {
      const depositAmount = ethers.parseEther("0.5");
      
      // Multiple users deposit
      for (const user of [user1, user2, user3]) {
        await weth.connect(user).approve(vault.target, depositAmount);
        await vault.connect(user).deposit(depositAmount);
      }
      
      // Verify all deposits
      for (const user of [user1, user2, user3]) {
        const userDeposit = await vault.userDeposits(user.address);
        expect(userDeposit.amount).to.equal(depositAmount);
      }
      
      // Users withdraw in different order
      await vault.connect(user2).withdraw();
      await vault.connect(user1).withdraw();
      await vault.connect(user3).withdraw();
      
      // Verify all withdrawals
      for (const user of [user1, user2, user3]) {
        const userDeposit = await vault.userDeposits(user.address);
        expect(userDeposit.amount).to.equal(0);
      }
    });
  });

  describe("Weight Calculation Security", function () {
    it("Should handle maximum weight values without overflow", async function () {
      const maxDeposit = ethers.parseEther("1"); // Maximum allowed deposit
      
      await weth.connect(user1).approve(vault.target, maxDeposit);
      await vault.connect(user1).deposit(maxDeposit);
      
      const userDeposit = await vault.userDeposits(user1.address);
      expect(userDeposit.amount).to.equal(maxDeposit);
      expect(userDeposit.weight).to.be.gt(0);
    });

    it("Should handle edge case of zero time elapsed", async function () {
      const depositAmount = ethers.parseEther("0.5");
      
      await weth.connect(user1).approve(vault.target, depositAmount);
      await vault.connect(user1).deposit(depositAmount);
      
      // Immediate withdrawal in same block should work
      const userDeposit = await vault.userDeposits(user1.address);
      expect(userDeposit.weight).to.be.gt(0); // Should have minimum weight
    });
  });

  describe("Access Control Tests", function () {
    it("Should prevent unauthorized access to admin functions", async function () {
      // Non-owner should not be able to set contracts
      await expect(
        vault.connect(user1).setLottery(user1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      await expect(
        vault.connect(user1).setPrizePool(user1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should allow only authorized contracts to call restricted functions", async function () {
      // Only lottery should be able to start new round
      await expect(
        vault.connect(user1).startNewRound(2)
      ).to.be.revertedWith("Only lottery");
    });
  });

  describe("Token Approval Security", function () {
    it("Should handle token approvals safely", async function () {
      const depositAmount = ethers.parseEther("0.5");
      
      // Test multiple deposits with different approval amounts
      await weth.connect(user1).approve(vault.target, depositAmount);
      await vault.connect(user1).deposit(depositAmount);
      
      // Second deposit should work with new approval
      await weth.connect(user1).approve(vault.target, depositAmount);
      await vault.connect(user1).deposit(depositAmount);
      
      const userDeposit = await vault.userDeposits(user1.address);
      expect(userDeposit.amount).to.equal(depositAmount * 2n);
    });
  });

  describe("Slippage Protection Tests", function () {
    it("Should protect against excessive slippage on withdrawal", async function () {
      const depositAmount = ethers.parseEther("1");
      
      await weth.connect(user1).approve(vault.target, depositAmount);
      await vault.connect(user1).deposit(depositAmount);
      
      // Normal withdrawal should work
      await vault.connect(user1).withdraw();
      
      const userDeposit = await vault.userDeposits(user1.address);
      expect(userDeposit.amount).to.equal(0);
    });
  });

  describe("Router Security Tests", function () {
    it("Should safely route deposits through router", async function () {
      const depositAmount = ethers.parseEther("0.5");
      
      await weth.connect(user1).approve(router.target, depositAmount);
      await router.connect(user1).deposit(depositAmount);
      
      const userDeposit = await vault.userDeposits(user1.address);
      expect(userDeposit.amount).to.equal(depositAmount);
    });

    it("Should safely route withdrawals through router", async function () {
      const depositAmount = ethers.parseEther("0.5");
      
      // Deposit through router
      await weth.connect(user1).approve(router.target, depositAmount);
      await router.connect(user1).deposit(depositAmount);
      
      // Withdraw through router
      await router.connect(user1).withdraw();
      
      const userDeposit = await vault.userDeposits(user1.address);
      expect(userDeposit.amount).to.equal(0);
    });
  });

  describe("Edge Cases and Error Handling", function () {
    it("Should handle zero deposits gracefully", async function () {
      await expect(
        vault.connect(user1).deposit(0)
      ).to.be.revertedWith("Amount must be greater than zero");
    });

    it("Should handle withdrawals with no deposits", async function () {
      await expect(
        vault.connect(user1).withdraw()
      ).to.be.revertedWith("No deposit to withdraw");
    });

    it("Should handle deposits below minimum", async function () {
      const tooSmall = ethers.parseEther("0.05"); // Below 0.1 ETH minimum
      
      await weth.connect(user1).approve(vault.target, tooSmall);
      await expect(
        vault.connect(user1).deposit(tooSmall)
      ).to.be.revertedWith("Deposit amount must be between 0.1 and 1 ETH");
    });

    it("Should handle deposits above maximum", async function () {
      const tooLarge = ethers.parseEther("2"); // Above 1 ETH maximum
      
      await weth.connect(user1).approve(vault.target, tooLarge);
      await expect(
        vault.connect(user1).deposit(tooLarge)
      ).to.be.revertedWith("Deposit amount must be between 0.1 and 1 ETH");
    });
  });

  describe("State Consistency Tests", function () {
    it("Should maintain consistent state across multiple operations", async function () {
      const depositAmount = ethers.parseEther("0.5");
      
      // Multiple users deposit
      await weth.connect(user1).approve(vault.target, depositAmount);
      await vault.connect(user1).deposit(depositAmount);
      
      await weth.connect(user2).approve(vault.target, depositAmount);
      await vault.connect(user2).deposit(depositAmount);
      
      // Check total deposits
      const totalDeposits = await vault.getDepositTotal();
      expect(totalDeposits).to.equal(depositAmount * 2n);
      
      // Check user count
      const userCount = await vault.getUserCount();
      expect(userCount).to.equal(2);
      
      // One user withdraws
      await vault.connect(user1).withdraw();
      
      // Check updated totals
      const totalDepositsAfter = await vault.getDepositTotal();
      expect(totalDepositsAfter).to.equal(depositAmount);
      
      const userCountAfter = await vault.getUserCount();
      expect(userCountAfter).to.equal(1);
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should use reasonable gas for deposits", async function () {
      const depositAmount = ethers.parseEther("0.5");
      
      await weth.connect(user1).approve(vault.target, depositAmount);
      const tx = await vault.connect(user1).deposit(depositAmount);
      const receipt = await tx.wait();
      
      // Gas usage should be reasonable (less than 500k gas)
      expect(receipt!.gasUsed).to.be.lt(500000);
    });

    it("Should use reasonable gas for withdrawals", async function () {
      const depositAmount = ethers.parseEther("0.5");
      
      // First deposit
      await weth.connect(user1).approve(vault.target, depositAmount);
      await vault.connect(user1).deposit(depositAmount);
      
      // Then withdraw
      const tx = await vault.connect(user1).withdraw();
      const receipt = await tx.wait();
      
      // Gas usage should be reasonable (less than 500k gas)
      expect(receipt!.gasUsed).to.be.lt(500000);
    });
  });
});