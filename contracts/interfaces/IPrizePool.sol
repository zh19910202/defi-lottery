// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPrizePool {
    struct LotteryInfo {
        address winner;
        uint256 prizeValue;
        uint256 timestamp;
        uint256 randomNumber;
        bool isClaimed;
    }

    event PrizeClaimed(address indexed winner, uint256 indexed lotteryId, uint256 amount);
    event FeeRateUpdated(uint256 oldFeeRate, uint256 newFeeRate);
    event FeeCollected(uint256 amount);
    event YieldAggregatorSet(
        address indexed oldYieldAggregator,
        address indexed newYieldAggregator
    );
    event VaultSet(address indexed vault);

    /// @notice Allows a winner to claim their ETH prize
    /// @param lotteryId The ID of the lottery round to claim prize for
    function claimPrize(uint256 lotteryId) external;

    /// @notice Gets the current prize pool amount in ETH
    /// @return The current amount of ETH in the prize pool (in wei)
    function getPrizePoolAmount() external view returns (uint256);

    /// @notice Adds ETH to the prize pool
    function addToPrizePool() external payable;

    /// @notice Sets the fee rate for prize claims
    /// @param _feeRate The new fee rate in basis points (1% = 100)
    function setFeeRate(uint256 _feeRate) external;

    /// @notice Gets the current fee rate
    /// @return The fee rate in basis points
    function feeRate() external view returns (uint256);

    /// @notice Sets the yield aggregator address
    /// @param _yieldAggregator The address of the yield aggregator
    function setYieldAggregator(address _yieldAggregator) external;

    /// @notice Sets the vault address
    /// @param _vault The address of the vault
    function setVault(address _vault) external;

    /// @notice Sets the WETH token address
    /// @param _weth The address of the WETH token
    function setWETH(address _weth) external;
}
