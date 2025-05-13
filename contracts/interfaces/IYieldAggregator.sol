// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

/// @title Yield Aggregator Interface
/// @notice Interface for managing ETH deposits and withdrawals in yield protocols
interface IYieldAggregator {
    /// @notice Deposits funds into Compound to earn interest
    /// @param amount Amount of WETH to deposit
    /// @return success True if deposit was successful
    function deposit(uint256 amount) external returns (bool);

    /// @notice Withdraws funds from Compound
    /// @param amount Amount of WETH to withdraw
    /// @return success True if withdrawal was successful
    function withdraw(uint256 amount) external returns (bool);

    /// @notice Gets the current balance in Compound
    /// @return The current balance in Compound
    function balanceOf() external view returns (uint256);

    /// @notice Emitted when funds are deposited into Compound
    /// @param user The address of the user who deposited
    /// @param amount The amount deposited
    /// @param timestamp The time when the deposit was made
    event Deposited(address indexed user, uint256 amount, uint256 timestamp);

    /// @notice Emitted when funds are withdrawn from Compound
    /// @param user The address of the user who withdrew
    /// @param amount The amount withdrawn
    /// @param timestamp The time when the withdrawal was made
    event Withdrawn(address indexed user, uint256 amount, uint256 timestamp);
}
