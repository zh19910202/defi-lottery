import { expect } from "chai";
import { ethers } from "hardhat";
import { LuckyValueCalculator } from "../typechain-types";

describe("Mathematical Verification Tests", function () {
  let calculator: LuckyValueCalculator;

  beforeEach(async function () {
    const LuckyValueCalculatorFactory = await ethers.getContractFactory("LuckyValueCalculator");
    calculator = await LuckyValueCalculatorFactory.deploy();
    await calculator.waitForDeployment();
  });

  describe("Weight Calculation Properties", function () {
    it("Should be deterministic - same inputs produce same outputs", async function () {
      const amount = ethers.parseEther("0.5");
      const timeElapsed = 3600; // 1 hour

      // Call the function multiple times with same inputs
      const result1 = await calculator.calculateLuckyValue(amount, timeElapsed);
      const result2 = await calculator.calculateLuckyValue(amount, timeElapsed);
      const result3 = await calculator.calculateLuckyValue(amount, timeElapsed);

      expect(result1).to.equal(result2);
      expect(result2).to.equal(result3);
    });

    it("Should be monotonic in amount - larger amounts produce larger weights", async function () {
      const timeElapsed = 3600;
      const amounts = [
        ethers.parseEther("0.1"),
        ethers.parseEther("0.3"),
        ethers.parseEther("0.5"),
        ethers.parseEther("0.7"),
        ethers.parseEther("1.0")
      ];

      const weights = [];
      for (const amount of amounts) {
        const weight = await calculator.calculateLuckyValue(amount, timeElapsed);
        weights.push(weight);
      }

      // Verify monotonicity
      for (let i = 1; i < weights.length; i++) {
        expect(weights[i]).to.be.gt(weights[i - 1]);
      }
    });

    it("Should be monotonic in time - longer time produces larger weights", async function () {
      const amount = ethers.parseEther("0.5");
      const timeValues = [0, 1800, 3600, 7200, 86400]; // 0, 30min, 1h, 2h, 1day

      const weights = [];
      for (const time of timeValues) {
        const weight = await calculator.calculateLuckyValue(amount, time);
        weights.push(weight);
      }

      // Verify monotonicity (allowing for zero time case)
      for (let i = 1; i < weights.length; i++) {
        expect(weights[i]).to.be.gte(weights[i - 1]);
      }
    });

    it("Should handle zero time elapsed correctly", async function () {
      const amount = ethers.parseEther("0.5");
      const zeroTime = 0;

      // Should not revert and should return a positive weight
      const weight = await calculator.calculateLuckyValue(amount, zeroTime);
      expect(weight).to.be.gt(0);
    });

    it("Should handle minimum amount correctly", async function () {
      const minAmount = 1; // 1 wei
      const timeElapsed = 3600;

      const weight = await calculator.calculateLuckyValue(minAmount, timeElapsed);
      expect(weight).to.be.gt(0);
    });

    it("Should handle maximum reasonable values without overflow", async function () {
      const maxAmount = ethers.parseEther("1000"); // Large but reasonable amount
      const maxTime = 365 * 24 * 3600; // 1 year in seconds

      // Should not revert
      const weight = await calculator.calculateLuckyValue(maxAmount, maxTime);
      expect(weight).to.be.gt(0);
    });

    it("Should revert with zero amount", async function () {
      const zeroAmount = 0;
      const timeElapsed = 3600;

      await expect(
        calculator.calculateLuckyValue(zeroAmount, timeElapsed)
      ).to.be.revertedWith("Amount must be positive");
    });
  });

  describe("Weight Calculation Bounds", function () {
    it("Should produce weights within reasonable bounds", async function () {
      const testCases = [
        { amount: ethers.parseEther("0.1"), time: 0 },
        { amount: ethers.parseEther("0.1"), time: 3600 },
        { amount: ethers.parseEther("1.0"), time: 0 },
        { amount: ethers.parseEther("1.0"), time: 86400 }
      ];

      for (const testCase of testCases) {
        const weight = await calculator.calculateLuckyValue(testCase.amount, testCase.time);
        
        // Weight should be positive
        expect(weight).to.be.gt(0);
        
        // Weight should not be unreasonably large (less than 2^96 for uint96 compatibility)
        const maxUint96 = BigInt("79228162514264337593543950335");
        expect(weight).to.be.lt(maxUint96);
      }
    });

    it("Should have reasonable weight distribution", async function () {
      const baseAmount = ethers.parseEther("0.5");
      const baseTime = 3600;

      const baseWeight = await calculator.calculateLuckyValue(baseAmount, baseTime);
      
      // Double amount should increase weight significantly but not double it
      // (due to the 80/20 amount/time ratio)
      const doubleAmountWeight = await calculator.calculateLuckyValue(baseAmount * 2n, baseTime);
      expect(doubleAmountWeight).to.be.gt(baseWeight);
      expect(doubleAmountWeight).to.be.lt(baseWeight * 2n);

      // Double time should increase weight but less than double amount
      const doubleTimeWeight = await calculator.calculateLuckyValue(baseAmount, baseTime * 2);
      expect(doubleTimeWeight).to.be.gt(baseWeight);
      expect(doubleTimeWeight).to.be.lt(doubleAmountWeight);
    });
  });

  describe("Edge Cases and Error Conditions", function () {
    it("Should handle very small amounts", async function () {
      const verySmallAmount = 1; // 1 wei
      const timeElapsed = 1;

      const weight = await calculator.calculateLuckyValue(verySmallAmount, timeElapsed);
      expect(weight).to.be.gt(0);
    });

    it("Should handle very large time values", async function () {
      const amount = ethers.parseEther("0.5");
      const veryLargeTime = 10 * 365 * 24 * 3600; // 10 years

      const weight = await calculator.calculateLuckyValue(amount, veryLargeTime);
      expect(weight).to.be.gt(0);
    });

    it("Should maintain precision with fractional ETH amounts", async function () {
      const fractionalAmounts = [
        ethers.parseEther("0.123456789"),
        ethers.parseEther("0.987654321"),
        ethers.parseEther("0.555555555")
      ];

      for (const amount of fractionalAmounts) {
        const weight = await calculator.calculateLuckyValue(amount, 3600);
        expect(weight).to.be.gt(0);
      }
    });
  });

  describe("Weight Calculation Consistency", function () {
    it("Should maintain consistent ratios between different amounts", async function () {
      const timeElapsed = 3600;
      const amount1 = ethers.parseEther("0.2");
      const amount2 = ethers.parseEther("0.4");
      const amount3 = ethers.parseEther("0.8");

      const weight1 = await calculator.calculateLuckyValue(amount1, timeElapsed);
      const weight2 = await calculator.calculateLuckyValue(amount2, timeElapsed);
      const weight3 = await calculator.calculateLuckyValue(amount3, timeElapsed);

      // The ratio between weights should be consistent with the amount ratio
      // Due to the 80% weight on amount, doubling amount should roughly double the weight
      const ratio1to2 = Number(weight2) / Number(weight1);
      const ratio2to3 = Number(weight3) / Number(weight2);

      // Both ratios should be close to 2 (within some tolerance due to time component)
      expect(ratio1to2).to.be.closeTo(2, 0.5);
      expect(ratio2to3).to.be.closeTo(2, 0.5);
    });

    it("Should have predictable behavior with time progression", async function () {
      const amount = ethers.parseEther("0.5");
      const timeProgression = [0, 1800, 3600, 7200, 14400]; // 0, 30min, 1h, 2h, 4h

      const weights = [];
      for (const time of timeProgression) {
        const weight = await calculator.calculateLuckyValue(amount, time);
        weights.push(Number(weight));
      }

      // Each subsequent weight should be larger than the previous
      for (let i = 1; i < weights.length; i++) {
        expect(weights[i]).to.be.gt(weights[i - 1]);
      }

      // The increase should be diminishing (time has 20% weight vs 80% for amount)
      const increases = [];
      for (let i = 1; i < weights.length; i++) {
        increases.push(weights[i] - weights[i - 1]);
      }

      // Later increases should be smaller than earlier ones (diminishing returns)
      for (let i = 1; i < increases.length; i++) {
        expect(increases[i]).to.be.lte(increases[i - 1] * 1.1); // Allow small tolerance
      }
    });
  });
});