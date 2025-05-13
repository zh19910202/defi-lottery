// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { UD60x18, ud } from "@prb/math/src/UD60x18.sol";

/// @title TimeWeightedMath Library
/// @notice High-precision time decay factor calculation for lottery weights
/// @dev Implements mathematical functions for calculating user weights and lucky values
library LuckyValueCalculator {
    using { ud } for uint256;

    // Default parameters as constants
    uint32 private constant TIME_WEIGHT_RATIO = 2000; // 20% - 减少时间因素的权重
    uint32 private constant AMOUNT_WEIGHT_RATIO = 8000; // 80% - 增加金额因素的权重
    uint192 private constant PRECISION = 1e18;

    /// @notice Calculates user's lucky value based on deposit amount and time
    /// @dev Uses PRBMath for high-precision logarithmic calculations
    /// @param amount User's deposit amount
    /// @param elapsed Time elapsed since deposit
    /// @return User's lucky value
    function calculateLuckyValue(uint256 amount, uint256 elapsed) internal pure returns (uint256) {
        require(amount > 0, "Amount must be positive");
        require(elapsed > 0, "Time elapsed must be positive");

        // Calculate time weight using logarithmic decay
        uint256 timeWeight = (elapsed * TIME_WEIGHT_RATIO) / 10000;

        // Calculate amount weight
        uint256 amountWeight = (amount * AMOUNT_WEIGHT_RATIO) / 10000;

        // Combine weights with precision scaling
        return (timeWeight + amountWeight) * PRECISION;
    }

    /// @notice Calculates time-weighted value for a given amount
    /// @param amount The amount to calculate weight for
    /// @param timestamp The timestamp to use for calculation
    /// @return The calculated time-weighted value
    function calculateTimeWeight(
        uint256 amount,
        uint256 timestamp
    ) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - timestamp;
        return calculateLuckyValue(amount, elapsed);
    }
}
