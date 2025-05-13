// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
import "./lib/LuckyValueCalculator.sol";
import "./interfaces/ILottery.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IPrizePool.sol";
import "./lib/SortitionSumTree.sol";

/// @title Lottery Contract
/// @notice A decentralized lottery system using Chainlink VRF v2.5 for random number generation
/// @dev Implements time-weighted user participation and monthly draws via Chainlink Automation
contract Lottery is VRFConsumerBaseV2Plus, ILottery, AutomationCompatibleInterface {
    /// @notice Chainlink VRF coordinator interface for random number generation
    IVRFCoordinatorV2Plus private vrfCoordinator;
    /// @notice Chainlink VRF subscription ID for funding random number requests
    uint256 private subscriptionId;
    /// @notice Chainlink VRF key hash for specifying gas lane
    bytes32 private keyHash;
    /// @notice Whether to use native ETH payment for VRF requests
    bool private enableNativePayment;

    /// @notice Address of the vault contract
    IVault public vault;
    IPrizePool public prizePool;

    /// @notice Current lottery round ID
    uint256 public currentRoundId;
    uint256 public lastDrawTimestamp;
    uint256 public nextDrawTimestamp;

    // Monthly draw interval (approximately 30 days)
    uint256 public constant DRAW_INTERVAL = 30 days;

    // Minimum prize pool amount (in ETH with 18 decimals) - 0.1 ETH
    uint256 public constant MIN_PRIZE_POOL = 0.1 ether;

    // Tree branching factor, affects tree depth and performance
    uint256 private constant TREE_K = 8;

    // Extended LotteryRound structure, adding SortitionSumTree
    struct ExtendedLotteryRound {
        LotteryRound info;
        SortitionSumTree.Tree weightTree;
        bool initialized;
    }

    /// @notice Mapping of round ID to extended lottery round information
    mapping(uint256 => ExtendedLotteryRound) private extendedLotteryRounds;

    /// @notice Event emitted when vault address is updated
    event VaultUpdated(address indexed oldVault, address indexed newVault);

    /// @notice Event emitted when prize pool address is updated
    event PrizePoolUpdated(address indexed oldPricePool, address indexed newPrizePool);

    /// @notice Event emitted when a new lottery round is started
    event NewLotteryRoundStarted(uint256 indexed roundId, uint256 timestamp);

    /// @notice Event emitted when user weight is updated in the tree
    event UserWeightUpdated(address indexed user, uint256 weight, uint256 roundId);

    /// @notice Event emitted when tried to draw an already drawn lottery round
    event LotteryAlreadyDrawn(uint256 indexed roundId);

    /// @notice Event emitted when a lottery draw is triggered
    // event LotteryTriggered(uint256 indexed requestId, uint256 indexed roundId);

    /// @notice Event emitted when a winner is selected
    // event WinnerSelected(address indexed winner, uint256 prize, uint256 indexed roundId);

    /// @notice Checks if a specific round has been drawn
    /// @param roundId The round ID to check
    /// @return Whether the round has been drawn
    function isRoundDrawn(uint256 roundId) public view returns (bool) {
        return
            extendedLotteryRounds[roundId].info.winner != address(0) ||
            extendedLotteryRounds[roundId].info.timestamp != 0;
    }

    /// @notice Sets the vault contract address
    /// @param _vault The address of the vault contract
    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid vault address");
        address oldVault = address(vault);
        vault = IVault(_vault);
        emit VaultUpdated(oldVault, _vault);
    }

    /// @notice Sets the prize pool contract address
    /// @param _prizePool The address of the prize pool contract
    function setPrizePool(address _prizePool) external onlyOwner {
        require(_prizePool != address(0), "Invalid prize pool address");
        address oldPrizePool = address(prizePool);
        prizePool = IPrizePool(_prizePool);
        emit PrizePoolUpdated(oldPrizePool, _prizePool);
    }

    /// @notice Gets the lottery round information for a specific round ID
    /// @param roundId The ID of the lottery round to query
    /// @return The lottery round information
    function lotteryRound(uint256 roundId) external view override returns (LotteryRound memory) {
        return extendedLotteryRounds[roundId].info;
    }

    /// @notice Event emitted when fees are withdrawn
    event FeesWithdrawn(address indexed owner, uint256 amount);

    constructor(
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash,
        bool _enableNativePayment
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        require(_vrfCoordinator != address(0), "Invalid VRF Coordinator");
        vrfCoordinator = IVRFCoordinatorV2Plus(_vrfCoordinator);
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
        enableNativePayment = _enableNativePayment;

        // Initialize the first draw timestamp
        lastDrawTimestamp = block.timestamp;
        nextDrawTimestamp = block.timestamp + DRAW_INTERVAL;

        // Initialize round ID to 0
        currentRoundId = 0;

        // Initialize first round's SortitionSumTree
        _initializeRoundTree(currentRoundId);
    }

    /// @notice Initializes the SortitionSumTree for a specific round
    /// @param roundId The round ID to initialize
    function _initializeRoundTree(uint256 roundId) private {
        if (!extendedLotteryRounds[roundId].initialized) {
            SortitionSumTree.createTree(extendedLotteryRounds[roundId].weightTree, TREE_K);
            extendedLotteryRounds[roundId].initialized = true;
        }
    }

    /// @notice Updates user weight in the current round's sortition tree
    /// @param user User address
    /// @param weight New weight value
    function updateUserWeight(
        address user,
        uint256 weight
    ) external override onlyVault returns (bool) {
        _initializeRoundTree(currentRoundId);
        SortitionSumTree.set(extendedLotteryRounds[currentRoundId].weightTree, user, weight);
        emit UserWeightUpdated(user, weight, currentRoundId);
        return true;
    }

    modifier onlyVault() {
        require(msg.sender == address(vault), "Only Vault can call this function");
        _;
    }

    /// @notice Checks if upkeep is needed for Chainlink Automation
    /// @param checkData Additional data used in checking upkeep
    /// @return upkeepNeeded Boolean indicating if upkeep is needed
    /// @return performData Bytes data to be used in performUpkeep
    function checkUpkeep(
        bytes calldata checkData
    ) external view override returns (bool upkeepNeeded, bytes memory performData) {
        bool timeCondition = block.timestamp >= nextDrawTimestamp;
        uint256 prizePoolAmount = IPrizePool(prizePool).getPrizePoolAmount();
        bool prizePoolCondition = prizePoolAmount > 0;
        bool hasParticipants = getTotalWeight(currentRoundId) > 0;
        bool notDrawnYet = !isRoundDrawn(currentRoundId);
        upkeepNeeded = timeCondition && prizePoolCondition && hasParticipants && notDrawnYet;
        return (upkeepNeeded, "");
    }

    /// @notice Performs the upkeep task if conditions are met
    /// @param performData Data used in performing upkeep
    function performUpkeep(bytes calldata performData) external override {
        bool timeCondition = block.timestamp >= nextDrawTimestamp;
        uint256 prizePoolAmount = IPrizePool(prizePool).getPrizePoolAmount();
        bool prizePoolCondition = prizePoolAmount > 0;
        bool hasParticipants = getTotalWeight(currentRoundId) > 0;
        bool notDrawnYet = !isRoundDrawn(currentRoundId);

        if (!notDrawnYet) {
            emit LotteryAlreadyDrawn(currentRoundId);
            return;
        }

        bool upkeepNeeded = timeCondition && prizePoolCondition && hasParticipants && notDrawnYet;
        require(upkeepNeeded, "Upkeep not needed");

        lastDrawTimestamp = block.timestamp;
        nextDrawTimestamp = block.timestamp + DRAW_INTERVAL;

        _triggerDraw();
    }

    /// @notice Triggers a lottery draw by requesting random words from Chainlink VRF v2.5
    function _triggerDraw() internal {
        uint256 requestId = vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: keyHash,
                subId: subscriptionId,
                requestConfirmations: 3,
                callbackGasLimit: 300000,
                numWords: 1,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({ nativePayment: enableNativePayment })
                )
            })
        );

        emit LotteryTriggered(requestId, currentRoundId);
    }

    /// @notice Callback function called by VRF Coordinator
    /// @dev Uses current round's SortitionSumTree to efficiently select a winner
    /// @param requestId VRF request ID
    /// @param randomWords Array of random values
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        uint256 totalWeight = getTotalWeight(currentRoundId);
        require(totalWeight > 0, "Total weight must be greater than zero");

        uint256 winningTicket = randomWords[0] % totalWeight;
        address winner = SortitionSumTree.draw(
            extendedLotteryRounds[currentRoundId].weightTree,
            winningTicket
        );

        if (winner == address(0)) {
            winner = vault.getUser(0);
        }

        uint256 prize = prizePool.getPrizePoolAmount();

        extendedLotteryRounds[currentRoundId].info = LotteryRound({
            requestedId: requestId,
            winner: winner,
            prizeValue: prize,
            timestamp: block.timestamp,
            randomNumber: randomWords[0],
            isClaimed: false,
            drawTimestamp: block.timestamp
        });

        _startNewRound();

        emit WinnerSelected(winner, prize, currentRoundId - 1);
    }

    /// @notice Gets the total weight of the tree for a specific round
    /// @param roundId The round ID
    /// @return The total weight of the tree
    function getTotalWeight(uint256 roundId) public view returns (uint256) {
        if (!extendedLotteryRounds[roundId].initialized) {
            return 0;
        }
        return SortitionSumTree.total(extendedLotteryRounds[roundId].weightTree);
    }

    /// @notice Gets the total weight of the current round's tree
    /// @return The total weight of the current round's tree
    function getTotalWeight() public view returns (uint256) {
        return getTotalWeight(currentRoundId);
    }

    /// @notice Starts a new lottery round
    function _startNewRound() internal {
        currentRoundId++;
        _initializeRoundTree(currentRoundId);
        vault.startNewRound(currentRoundId);
        emit NewLotteryRoundStarted(currentRoundId, block.timestamp);
    }

    function updateIsClaimed(uint256 lotteryId) external override onlyPrizePool {
        require(!extendedLotteryRounds[lotteryId].info.isClaimed, "Claimed already");
        extendedLotteryRounds[lotteryId].info.isClaimed = true;
    }

    modifier onlyPrizePool() {
        require(msg.sender == address(prizePool), "Caller is not the PrizePool contract");
        _;
    }



    /// @notice Gets the current active lottery round ID
    /// @return The ID of the current lottery round
    function getCurrentRoundId() external view override returns (uint256) {
        return currentRoundId;
    }

    
}
