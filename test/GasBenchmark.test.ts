import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  Vault,
  GasOptimizedVault,
  MockERC20,
  VaultShareToken
} from "../typechain-types";
import { setupTest } from "./utils/setup";

describe("Gas Benchmark Tests", function () {
  let vault: Vault;
  let optimizedVault: GasOptimizedVault;
  let weth: MockERC20;
  let shareToken: VaultShareToken;
  let owner: SignerWithAddress;
  let users: SignerWithAddress[];

  beforeEach(async function () {
    const setup = await setupTest();
    vault = setup.contracts.vault as any;
    weth = setup.contracts.usdc as any; // Using USDC as WETH mock
    owner = setup.accounts.owner;
    users = setup.accounts.users;

    // Deploy optimized vault
    const GasOptimizedVaultFactory = await ethers.getContractFactory("GasOptimizedVault");
    optimizedVault = await GasOptimizedVaultFactory.deploy(owner.address);
    await optimizedVault.waitForDeployment();

    // Set up optimized vault with same configuration as regular vault
    await optimizedVault.setWETH(weth.target);
    await optimizedVault.setLottery(setup.contracts.lottery.target);
    await optimizedVault.setPrizePool(setup.contracts.prizePool.target);
    await optimizedVault.setYieldAggregator(setup.contracts.yieldAggregator.target);

    // Deploy and set share token for optimized vault
    const VaultShareTokenFactory = await ethers.getContractFactory("VaultShareToken");
    const optimizedShareToken = await VaultShareTokenFactory.deploy(
      "Optimized Vault Share Token",
      "OVST",
      optimizedVault.target
    );
    await optimizedShareToken.waitForDeployment();
    await optimizedVault.setShareToken(optimizedShareToken.target);

    // Get share token for regular vault
    const shareTokenAddress = await vault.getShareToken();
    shareToken = await ethers.getContractAt("VaultShareToken", shareTokenAddress) as any;
  });

  describe("Single Deposit Gas Comparison", function () {
    it("Should compare gas usage for single deposit", async function () {
      const user = users[0];
      const depositAmount = ethers.parseEther("0.5");

      // Prepare tokens for both vaults
      await weth.mint(user.address, depositAmount * 2n);
      await weth.connect(user).approve(vault.target, depositAmount);
      await weth.connect(user).approve(optimizedVault.target, depositAmount);

      // Test regular vault deposit
      const regularTx = await vault.connect(user).deposit(depositAmount);
      const regularReceipt = await regularTx.wait();
      const regularGasUsed = regularReceipt!.gasUsed;

      // Test optimized vault deposit
      const optimizedTx = await optimizedVault.connect(user).optimizedDeposit(depositAmount);
      const optimizedReceipt = await optimizedTx.wait();
      const optimizedGasUsed = optimizedReceipt!.gasUsed;

      console.log(`Regular deposit gas: ${regularGasUsed}`);
      console.log(`Optimized deposit gas: ${optimizedGasUsed}`);
      console.log(`Gas savings: ${regularGasUsed - optimizedGasUsed} (${((Number(regularGasUsed - optimizedGasUsed) / Number(regularGasUsed)) * 100).toFixed(2)}%)`);

      // Optimized version should use less gas
      expect(optimizedGasUsed).to.be.lt(regularGasUsed);
    });
  });

  describe("Single Withdrawal Gas Comparison", function () {
    it("Should compare gas usage for single withdrawal", async function () {
      const user = users[0];
      const depositAmount = ethers.parseEther("0.5");

      // Set up deposits in both vaults
      await weth.mint(user.address, depositAmount * 2n);
      
      // Regular vault deposit
      await weth.connect(user).approve(vault.target, depositAmount);
      await vault.connect(user).deposit(depositAmount);

      // Optimized vault deposit
      await weth.connect(user).approve(optimizedVault.target, depositAmount);
      await optimizedVault.connect(user).optimizedDeposit(depositAmount);

      // Test regular vault withdrawal
      const regularTx = await vault.connect(user).withdraw();
      const regularReceipt = await regularTx.wait();
      const regularGasUsed = regularReceipt!.gasUsed;

      // Test optimized vault withdrawal
      const optimizedTx = await optimizedVault.connect(user).optimizedWithdraw();
      const optimizedReceipt = await optimizedTx.wait();
      const optimizedGasUsed = optimizedReceipt!.gasUsed;

      console.log(`Regular withdrawal gas: ${regularGasUsed}`);
      console.log(`Optimized withdrawal gas: ${optimizedGasUsed}`);
      console.log(`Gas savings: ${regularGasUsed - optimizedGasUsed} (${((Number(regularGasUsed - optimizedGasUsed) / Number(regularGasUsed)) * 100).toFixed(2)}%)`);

      // Optimized version should use less gas
      expect(optimizedGasUsed).to.be.lt(regularGasUsed);
    });
  });

  describe("Batch Operations Gas Efficiency", function () {
    it("Should test batch deposit efficiency", async function () {
      const batchSize = 5;
      const depositAmount = ethers.parseEther("0.2");
      const batchUsers = users.slice(0, batchSize);
      const amounts = new Array(batchSize).fill(depositAmount);

      // Prepare tokens
      const totalAmount = depositAmount * BigInt(batchSize);
      await weth.mint(owner.address, totalAmount);
      await weth.connect(owner).approve(optimizedVault.target, totalAmount);

      // Test batch deposit
      const batchTx = await optimizedVault.connect(owner).batchDeposit(
        batchUsers.map(u => u.address),
        amounts
      );
      const batchReceipt = await batchTx.wait();
      const batchGasUsed = batchReceipt!.gasUsed;

      // Compare with individual deposits
      let individualGasTotal = 0n;
      for (let i = 0; i < batchSize; i++) {
        await weth.mint(batchUsers[i].address, depositAmount);
        await weth.connect(batchUsers[i]).approve(vault.target, depositAmount);
        
        const individualTx = await vault.connect(batchUsers[i]).deposit(depositAmount);
        const individualReceipt = await individualTx.wait();
        individualGasTotal += individualReceipt!.gasUsed;
      }

      console.log(`Batch deposit gas (${batchSize} users): ${batchGasUsed}`);
      console.log(`Individual deposits total gas: ${individualGasTotal}`);
      console.log(`Gas savings: ${individualGasTotal - batchGasUsed} (${((Number(individualGasTotal - batchGasUsed) / Number(individualGasTotal)) * 100).toFixed(2)}%)`);

      // Batch should be more efficient
      expect(batchGasUsed).to.be.lt(individualGasTotal);
    });
  });

  describe("Storage Access Optimization", function () {
    it("Should compare gas for multiple reads", async function () {
      const user = users[0];
      const depositAmount = ethers.parseEther("0.5");
      const roundId = 0;

      // Set up deposits
      await weth.mint(user.address, depositAmount * 2n);
      
      await weth.connect(user).approve(vault.target, depositAmount);
      await vault.connect(user).deposit(depositAmount);

      await weth.connect(user).approve(optimizedVault.target, depositAmount);
      await optimizedVault.connect(user).optimizedDeposit(depositAmount);

      // Test multiple reads from regular vault
      const regularReadTx = await vault.userDeposits(user.address, roundId);
      
      // Test multiple reads from optimized vault
      const optimizedReadTx = await optimizedVault.getOptimizedUserDeposit(user.address, roundId);

      // Both should return the same data
      expect(regularReadTx.amount).to.equal(optimizedReadTx.amount);
      expect(regularReadTx.weight).to.equal(optimizedReadTx.weight);
    });
  });

  describe("Gas Usage Under Different Conditions", function () {
    it("Should measure gas usage with varying number of participants", async function () {
      const participantCounts = [1, 5, 10, 20];
      const depositAmount = ethers.parseEther("0.1");

      for (const count of participantCounts) {
        // Fresh vault for each test
        const GasOptimizedVaultFactory = await ethers.getContractFactory("GasOptimizedVault");
        const testVault = await GasOptimizedVaultFactory.deploy(owner.address);
        await testVault.waitForDeployment();

        // Set up vault
        await testVault.setWETH(weth.target);
        await testVault.setLottery(vault.lottery());
        await testVault.setPrizePool(vault.prizePool());
        await testVault.setYieldAggregator(vault.yieldAggregator());

        // Add participants
        for (let i = 0; i < count - 1; i++) {
          await weth.mint(users[i].address, depositAmount);
          await weth.connect(users[i]).approve(testVault.target, depositAmount);
          await testVault.connect(users[i]).optimizedDeposit(depositAmount);
        }

        // Measure gas for the last participant
        const lastUser = users[count - 1];
        await weth.mint(lastUser.address, depositAmount);
        await weth.connect(lastUser).approve(testVault.target, depositAmount);

        const tx = await testVault.connect(lastUser).optimizedDeposit(depositAmount);
        const receipt = await tx.wait();

        console.log(`Gas for deposit with ${count} participants: ${receipt!.gasUsed}`);
      }
    });

    it("Should measure gas usage for different deposit amounts", async function () {
      const amounts = [
        ethers.parseEther("0.1"),
        ethers.parseEther("0.3"),
        ethers.parseEther("0.5"),
        ethers.parseEther("0.8"),
        ethers.parseEther("1.0")
      ];

      for (let i = 0; i < amounts.length; i++) {
        const user = users[i];
        const amount = amounts[i];

        await weth.mint(user.address, amount);
        await weth.connect(user).approve(optimizedVault.target, amount);

        const tx = await optimizedVault.connect(user).optimizedDeposit(amount);
        const receipt = await tx.wait();

        console.log(`Gas for ${ethers.formatEther(amount)} ETH deposit: ${receipt!.gasUsed}`);
      }
    });
  });

  describe("Memory vs Storage Optimization", function () {
    it("Should demonstrate storage packing benefits", async function () {
      const user = users[0];
      const depositAmount = ethers.parseEther("0.5");
      const roundId = 0;

      // Set up deposit in optimized vault
      await weth.mint(user.address, depositAmount);
      await weth.connect(user).approve(optimizedVault.target, depositAmount);
      await optimizedVault.connect(user).optimizedDeposit(depositAmount);

      // Test packed storage read
      const packedData = await optimizedVault.getOptimizedUserDeposit(user.address, roundId);
      expect(packedData.amount).to.equal(depositAmount);
      expect(packedData.weight).to.be.gt(0);
      expect(packedData.timestamp).to.be.gt(0);

      // Test round info read
      const roundInfo = await optimizedVault.getOptimizedRoundInfo(roundId);
      expect(roundInfo.totalDeposits).to.equal(depositAmount);
      expect(roundInfo.totalWeight).to.be.gt(0);
    });
  });

  describe("Function Selector Optimization", function () {
    it("Should test optimized function calls", async function () {
      const user = users[0];
      const depositAmount = ethers.parseEther("0.5");

      await weth.mint(user.address, depositAmount);
      await weth.connect(user).approve(optimizedVault.target, depositAmount);
      await optimizedVault.connect(user).optimizedDeposit(depositAmount);

      // Test optimized participation check
      const hasParticipated = await optimizedVault.hasParticipatedOptimized(user.address, 0);
      expect(hasParticipated).to.be.true;

      // Test after withdrawal
      await optimizedVault.connect(user).optimizedWithdraw();
      const hasParticipatedAfter = await optimizedVault.hasParticipatedOptimized(user.address, 0);
      expect(hasParticipatedAfter).to.be.false;
    });
  });
});