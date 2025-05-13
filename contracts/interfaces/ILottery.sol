// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Lottery Interface
/// @notice Interface for managing lottery operations and user weights
interface ILottery {
    /// @notice Structure to store lottery round information
    struct LotteryRound {
        uint256 requestedId;
        address winner;
        uint256 prizeValue;
        uint256 timestamp;
        uint256 randomNumber;
        bool isClaimed;
        uint256 drawTimestamp;
    }

    /// @notice Gets the lottery round information for a specific round ID
    /// @param roundId The ID of the lottery round to query
    /// @return The lottery round information
    function lotteryRound(uint256 roundId) external view returns (LotteryRound memory);

    /// @notice Updates the claimed status of a lottery round
    /// @param lotteryId The ID of the lottery round to update
    function updateIsClaimed(uint256 lotteryId) external;

    /// @notice Gets the timestamp for the next lottery draw
    /// @return The timestamp when the next lottery draw will occur
    function nextDrawTimestamp() external view returns (uint256);

    /// @notice Gets the current active lottery round ID
    /// @return The ID of the current lottery round
    function getCurrentRoundId() external view returns (uint256);


    /// @notice Sets the vault contract address
    /// @param _vault The address of the vault contract
    function setVault(address _vault) external;

    /// @notice Sets the prize pool contract address
    /// @param _prizePool The address of the prize pool contract
    function setPrizePool(address _prizePool) external;

    /// @notice Emitted when a lottery draw is triggered
    /// @param requestId The unique identifier for the draw request
    /// @param roundId The ID of the lottery round
    event LotteryTriggered(uint256 requestId, uint256 roundId);

    /// @notice Emitted when a winner is selected in the lottery
    /// @param winner The address of the winning user
    /// @param amount The amount won by the winner
    /// @param roundId The ID of the lottery round
    event WinnerSelected(address winner, uint256 amount, uint256 roundId);

    /// @notice Updates a user's weight in the SortitionSumTree
    /// @param user The address of the user
    /// @param weight The new weight value for the user
    /// @return Success status of the weight update
    function updateUserWeight(address user, uint256 weight) external returns (bool);
}
