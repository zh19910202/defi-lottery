import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { EmergencyPause } from "../typechain-types";

describe("Emergency Pause Tests", function () {
  let emergencyPause: EmergencyPause;
  let owner: SignerWithAddress;
  let guardian: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [owner, guardian, user1, user2] = await ethers.getSigners();

    const EmergencyPauseFactory = await ethers.getContractFactory("EmergencyPause");
    emergencyPause = await EmergencyPauseFactory.deploy(guardian.address);
    await emergencyPause.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct emergency guardian", async function () {
      expect(await emergencyPause.emergencyGuardian()).to.equal(guardian.address);
    });

    it("Should not be paused initially", async function () {
      expect(await emergencyPause.paused()).to.be.false;
    });

    it("Should revert with zero address guardian", async function () {
      const EmergencyPauseFactory = await ethers.getContractFactory("EmergencyPause");
      await expect(
        EmergencyPauseFactory.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid guardian address");
    });
  });

  describe("Emergency Guardian Management", function () {
    it("Should allow owner to set new emergency guardian", async function () {
      await expect(emergencyPause.connect(owner).setEmergencyGuardian(user1.address))
        .to.emit(emergencyPause, "EmergencyGuardianSet")
        .withArgs(guardian.address, user1.address);

      expect(await emergencyPause.emergencyGuardian()).to.equal(user1.address);
    });

    it("Should not allow non-owner to set emergency guardian", async function () {
      await expect(
        emergencyPause.connect(user1).setEmergencyGuardian(user2.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should not allow setting zero address as guardian", async function () {
      await expect(
        emergencyPause.connect(owner).setEmergencyGuardian(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid guardian address");
    });
  });

  describe("Emergency Pause Functionality", function () {
    it("Should allow owner to activate emergency pause", async function () {
      await expect(emergencyPause.connect(owner).emergencyPause())
        .to.emit(emergencyPause, "EmergencyPauseActivated")
        .withArgs(owner.address, await ethers.provider.getBlockNumber().then(async (blockNumber) => {
          const block = await ethers.provider.getBlock(blockNumber + 1);
          return block!.timestamp;
        }));

      expect(await emergencyPause.paused()).to.be.true;
    });

    it("Should allow guardian to activate emergency pause", async function () {
      await expect(emergencyPause.connect(guardian).emergencyPause())
        .to.emit(emergencyPause, "EmergencyPauseActivated");

      expect(await emergencyPause.paused()).to.be.true;
    });

    it("Should not allow non-authorized users to activate emergency pause", async function () {
      await expect(
        emergencyPause.connect(user1).emergencyPause()
      ).to.be.revertedWith("Not authorized for emergency actions");
    });

    it("Should not allow activating pause when already paused", async function () {
      await emergencyPause.connect(owner).emergencyPause();
      
      await expect(
        emergencyPause.connect(owner).emergencyPause()
      ).to.be.revertedWith("Already paused");
    });
  });

  describe("Emergency Unpause Functionality", function () {
    beforeEach(async function () {
      await emergencyPause.connect(owner).emergencyPause();
    });

    it("Should allow owner to deactivate emergency pause", async function () {
      await expect(emergencyPause.connect(owner).emergencyUnpause())
        .to.emit(emergencyPause, "EmergencyPauseDeactivated")
        .withArgs(owner.address, await ethers.provider.getBlockNumber().then(async (blockNumber) => {
          const block = await ethers.provider.getBlock(blockNumber + 1);
          return block!.timestamp;
        }));

      expect(await emergencyPause.paused()).to.be.false;
    });

    it("Should allow guardian to deactivate emergency pause", async function () {
      await expect(emergencyPause.connect(guardian).emergencyUnpause())
        .to.emit(emergencyPause, "EmergencyPauseDeactivated");

      expect(await emergencyPause.paused()).to.be.false;
    });

    it("Should not allow non-authorized users to deactivate emergency pause", async function () {
      await expect(
        emergencyPause.connect(user1).emergencyUnpause()
      ).to.be.revertedWith("Not authorized for emergency actions");
    });
  });

  describe("Auto Unpause Functionality", function () {
    it("Should allow auto unpause after maximum duration", async function () {
      await emergencyPause.connect(owner).emergencyPause();
      
      // Fast forward time by 7 days + 1 second
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(emergencyPause.connect(user1).autoUnpause())
        .to.emit(emergencyPause, "EmergencyPauseDeactivated");

      expect(await emergencyPause.paused()).to.be.false;
    });

    it("Should not allow auto unpause before maximum duration", async function () {
      await emergencyPause.connect(owner).emergencyPause();
      
      // Fast forward time by 6 days (less than 7 days)
      await ethers.provider.send("evm_increaseTime", [6 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        emergencyPause.connect(user1).autoUnpause()
      ).to.be.revertedWith("Emergency pause duration not exceeded");
    });

    it("Should not allow auto unpause when not paused", async function () {
      await expect(
        emergencyPause.connect(user1).autoUnpause()
      ).to.be.revertedWith("Not paused");
    });
  });

  describe("Function-Specific Pause", function () {
    const testFunctionSelector = "0x12345678";

    it("Should allow owner to pause specific function", async function () {
      await expect(emergencyPause.connect(owner).toggleFunctionPause(testFunctionSelector, true))
        .to.emit(emergencyPause, "FunctionPauseToggled")
        .withArgs(testFunctionSelector, true);

      expect(await emergencyPause.functionPaused(testFunctionSelector)).to.be.true;
    });

    it("Should allow owner to unpause specific function", async function () {
      await emergencyPause.connect(owner).toggleFunctionPause(testFunctionSelector, true);
      
      await expect(emergencyPause.connect(owner).toggleFunctionPause(testFunctionSelector, false))
        .to.emit(emergencyPause, "FunctionPauseToggled")
        .withArgs(testFunctionSelector, false);

      expect(await emergencyPause.functionPaused(testFunctionSelector)).to.be.false;
    });

    it("Should not allow non-owner to pause specific function", async function () {
      await expect(
        emergencyPause.connect(user1).toggleFunctionPause(testFunctionSelector, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Emergency Pause Status Queries", function () {
    it("Should return correct emergency pause status when not paused", async function () {
      expect(await emergencyPause.isEmergencyPauseActive()).to.be.false;
      expect(await emergencyPause.getRemainingPauseTime()).to.equal(0);
    });

    it("Should return correct emergency pause status when paused", async function () {
      await emergencyPause.connect(owner).emergencyPause();
      
      expect(await emergencyPause.isEmergencyPauseActive()).to.be.true;
      
      const remainingTime = await emergencyPause.getRemainingPauseTime();
      expect(remainingTime).to.be.gt(0);
      expect(remainingTime).to.be.lte(7 * 24 * 60 * 60); // Should be <= 7 days
    });

    it("Should return false for emergency pause status after expiry", async function () {
      await emergencyPause.connect(owner).emergencyPause();
      
      // Fast forward time by 7 days + 1 second
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);

      expect(await emergencyPause.isEmergencyPauseActive()).to.be.false;
      expect(await emergencyPause.getRemainingPauseTime()).to.equal(0);
    });
  });
});