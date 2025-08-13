import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  Vault,
  VaultInvariants,
  MockERC20,
  VaultShareToken
} from "../typechain-types";
import { setupTest } from "./utils/setup";

describe("Property-Based Tests", function () {
  let vault: Vault;
  let invariants: VaultInvariants;
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

    // Get share token
    const shareTokenAddress = await vault.getShareToken();
    shareToken = await ethers.getContractAt("VaultShareToken", shareTokenAddress) as any;

    // Deploy invariants contract
    const VaultInvariantsFactory = await ethers.getContractFactory("VaultInvariants");
    invariants = await VaultInvariantsFactory.deploy(vault.target);
    await invariants.waitForDeployment();
  });

  describe("Invariant Testing", function () {
    it("Should maintain invariants after single deposit", async function () {
      const user = users[0];
      const depositAmount = ethers.parseEther("0.5");

      // Mint tokens and approve
      await weth.mint(user.address, depositAmount);
      await weth.connect(user).approve(vault.target, depositAmount);

      // Make deposit
      await vault.connect(user).deposit(depositAmount);

      // Check all invariants
      expect(await invariants.checkAllInvariants()).to.be.true;
    });

    it("Should maintain invariants after multiple deposits", async function () {
      const depositAmount = ethers.parseEther("0.3");

      // Multiple users deposit
      for (let i = 0; i < 3; i++) {
        const user = users[i];
        await weth.mint(user.address, depositAmount);
        await weth.connect(user).approve(vault.target, depositAmount);
        await vault.connect(user).deposit(depositAmount);

        // Check invariants after each deposit
        expect(await invariants.checkAllInvariants()).to.be.true;
      }
    });

    it("Should maintain invariants after deposit and withdrawal", async function () {
      const user = users[0];
      const depositAmount = ethers.parseEther("0.7");

      // Deposit
      await weth.mint(user.address, depositAmount);
      await weth.connect(user).approve(vault.target, depositAmount);
      await vault.connect(user).deposit(depositAmount);

      // Check invariants after deposit
      expect(await invariants.checkAllInvariants()).to.be.true;

      // Withdraw
      await vault.connect(user).withdraw();

      // Check invariants after withdrawal
      expect(await invariants.checkAllInvariants()).to.be.true;
    });

    it("Should maintain invariants with mixed operations", async function () {
      const depositAmounts = [
        ethers.parseEther("0.2"),
        ethers.parseEther("0.5"),
        ethers.parseEther("0.8")
      ];

      // First round of deposits
      for (let i = 0; i < 3; i++) {
        const user = users[i];
        await weth.mint(user.address, depositAmounts[i]);
        await weth.connect(user).approve(vault.target, depositAmounts[i]);
        await vault.connect(user).deposit(depositAmounts[i]);
      }

      // Check invariants
      expect(await invariants.checkAllInvariants()).to.be.true;

      // One user withdraws
      await vault.connect(users[1]).withdraw();

      // Check invariants after withdrawal
      expect(await invariants.checkAllInvariants()).to.be.true;

      // Another user deposits more
      const additionalAmount = ethers.parseEther("0.4");
      await weth.mint(users[3].address, additionalAmount);
      await weth.connect(users[3]).approve(vault.target, additionalAmount);
      await vault.connect(users[3]).deposit(additionalAmount);

      // Final invariant check
      expect(await invariants.checkAllInvariants()).to.be.true;
    });
  });

  describe("Specific Invariant Tests", function () {
    it("Should maintain total deposits equals user deposits invariant", async function () {
      const users_subset = users.slice(0, 5);
      const amounts = [
        ethers.parseEther("0.1"),
        ethers.parseEther("0.3"),
        ethers.parseEther("0.5"),
        ethers.parseEther("0.7"),
        ethers.parseEther("1.0")
      ];

      // Multiple deposits
      for (let i = 0; i < users_subset.length; i++) {
        await weth.mint(users_subset[i].address, amounts[i]);
        await weth.connect(users_subset[i]).approve(vault.target, amounts[i]);
        await vault.connect(users_subset[i]).deposit(amounts[i]);
      }

      expect(await invariants.invariant_totalDepositsEqualsUserDeposits()).to.be.true;
    });

    it("Should maintain share token supply equals deposits invariant", async function () {
      const user = users[0];
      const depositAmount = ethers.parseEther("0.6");

      await weth.mint(user.address, depositAmount);
      await weth.connect(user).approve(vault.target, depositAmount);
      await vault.connect(user).deposit(depositAmount);

      expect(await invariants.invariant_shareTokenSupplyEqualsDeposits()).to.be.true;
    });

    it("Should maintain positive weights for depositors invariant", async function () {
      const user = users[0];
      const depositAmount = ethers.parseEther("0.4");

      await weth.mint(user.address, depositAmount);
      await weth.connect(user).approve(vault.target, depositAmount);
      await vault.connect(user).deposit(depositAmount);

      expect(await invariants.invariant_positiveWeightsForDepositors()).to.be.true;
    });

    it("Should maintain total weight equals user weights invariant", async function () {
      const users_subset = users.slice(0, 3);
      const depositAmount = ethers.parseEther("0.5");

      for (const user of users_subset) {
        await weth.mint(user.address, depositAmount);
        await weth.connect(user).approve(vault.target, depositAmount);
        await vault.connect(user).deposit(depositAmount);
      }

      expect(await invariants.invariant_totalWeightEqualsUserWeights()).to.be.true;
    });

    it("Should maintain deposits within range invariant", async function () {
      const user = users[0];
      const validAmount = ethers.parseEther("0.5"); // Within 0.1-1.0 ETH range

      await weth.mint(user.address, validAmount);
      await weth.connect(user).approve(vault.target, validAmount);
      await vault.connect(user).deposit(validAmount);

      expect(await invariants.invariant_depositsWithinRange()).to.be.true;
    });

    it("Should maintain no zero deposit participants invariant", async function () {
      const user = users[0];
      const depositAmount = ethers.parseEther("0.3");

      // Deposit
      await weth.mint(user.address, depositAmount);
      await weth.connect(user).approve(vault.target, depositAmount);
      await vault.connect(user).deposit(depositAmount);

      expect(await invariants.invariant_noZeroDepositParticipants()).to.be.true;

      // Withdraw
      await vault.connect(user).withdraw();

      // After withdrawal, user should not be in participants list
      expect(await invariants.invariant_noZeroDepositParticipants()).to.be.true;
    });
  });

  describe("Edge Case Testing", function () {
    it("Should handle minimum deposit correctly", async function () {
      const user = users[0];
      const minDeposit = await vault.MIN_DEPOSIT();

      await weth.mint(user.address, minDeposit);
      await weth.connect(user).approve(vault.target, minDeposit);
      await vault.connect(user).deposit(minDeposit);

      expect(await invariants.checkAllInvariants()).to.be.true;
    });

    it("Should handle maximum deposit correctly", async function () {
      const user = users[0];
      const maxDeposit = await vault.MAX_DEPOSIT();

      await weth.mint(user.address, maxDeposit);
      await weth.connect(user).approve(vault.target, maxDeposit);
      await vault.connect(user).deposit(maxDeposit);

      expect(await invariants.checkAllInvariants()).to.be.true;
    });

    it("Should maintain invariants with rapid deposit/withdrawal cycles", async function () {
      const user = users[0];
      const depositAmount = ethers.parseEther("0.5");

      // Mint enough tokens for multiple cycles
      await weth.mint(user.address, depositAmount * 5n);
      await weth.connect(user).approve(vault.target, depositAmount * 5n);

      // Perform multiple deposit/withdrawal cycles
      for (let i = 0; i < 3; i++) {
        await vault.connect(user).deposit(depositAmount);
        expect(await invariants.checkAllInvariants()).to.be.true;

        await vault.connect(user).withdraw();
        expect(await invariants.checkAllInvariants()).to.be.true;
      }
    });
  });

  describe("Stress Testing", function () {
    it("Should maintain invariants with maximum number of users", async function () {
      const maxUsers = Math.min(users.length, 10); // Limit for gas reasons
      const depositAmount = ethers.parseEther("0.2");

      // All users deposit
      for (let i = 0; i < maxUsers; i++) {
        await weth.mint(users[i].address, depositAmount);
        await weth.connect(users[i]).approve(vault.target, depositAmount);
        await vault.connect(users[i]).deposit(depositAmount);
      }

      expect(await invariants.checkAllInvariants()).to.be.true;

      // Half of users withdraw
      for (let i = 0; i < Math.floor(maxUsers / 2); i++) {
        await vault.connect(users[i]).withdraw();
      }

      expect(await invariants.checkAllInvariants()).to.be.true;
    });

    it("Should maintain invariants with varying deposit amounts", async function () {
      const amounts = [
        ethers.parseEther("0.1"),
        ethers.parseEther("0.15"),
        ethers.parseEther("0.33"),
        ethers.parseEther("0.67"),
        ethers.parseEther("0.99")
      ];

      for (let i = 0; i < amounts.length; i++) {
        await weth.mint(users[i].address, amounts[i]);
        await weth.connect(users[i]).approve(vault.target, amounts[i]);
        await vault.connect(users[i]).deposit(amounts[i]);

        expect(await invariants.checkAllInvariants()).to.be.true;
      }
    });
  });
});