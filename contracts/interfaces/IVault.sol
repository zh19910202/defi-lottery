// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IVault Interface
/// @notice Interface for the Vault contract that manages user deposits and withdrawals
interface IVault {
    /// @notice Struct to store user deposit information
    struct Deposit {
        uint128 amount;
        uint32 timestamp;
        uint96 weight;
    }

    /// @notice Emitted when a user makes a deposit
    /// @param user The address of the user who made the deposit
    /// @param amount The amount deposited
    /// @param timestamp The time of the deposit
    /// @param roundId The ID of the lottery round
    event Deposited(address indexed user, uint256 amount, uint256 timestamp, uint256 roundId);

    /// @notice Emitted when a user withdraws their deposit
    /// @param user The address of the user who made the withdrawal
    /// @param amount The amount withdrawn
    /// @param timestamp The time of the withdrawal
    /// @param roundId The ID of the lottery round
    event Withdrawn(address indexed user, uint256 amount, uint256 timestamp, uint256 roundId);

    /// @notice Emitted when a shortfall is covered by withdrawing from yield aggregator
    /// @param user The address of the user who triggered the shortfall
    /// @param amount The amount of the shortfall that was covered
    /// @param roundId The ID of the lottery round
    event ShortfallCovered(address indexed user, uint256 amount, uint256 roundId);

    /// @notice Emitted when lottery contract address is updated
    /// @param previousLottery The previous lottery address
    /// @param newLottery The new lottery address
    event LotterySet(address indexed previousLottery, address indexed newLottery);

    /// @notice Emitted when prize pool contract address is updated
    /// @param previousPrizePool The previous prize pool address
    /// @param newPrizePool The new prize pool address
    event PrizePoolSet(address indexed previousPrizePool, address indexed newPrizePool);

    /// @notice Emitted when WETH token address is updated
    /// @param previousWETH The previous WETH address
    /// @param newWETH The new WETH address
    event WETHSet(address indexed previousWETH, address indexed newWETH);

    /// @notice Emitted when share token address is updated
    /// @param previousShareToken The previous share token address
    /// @param newShareToken The new share token address
    event ShareTokenSet(address indexed previousShareToken, address indexed newShareToken);

    /// @notice Emitted when a fee is deposited to the yield aggregator
    /// @param amount The amount of the fee deposited
    /// @param timestamp The time of the deposit
    event FeeDeposited(uint256 amount, uint256 timestamp);

    /// @notice Emitted when a new round is started
    /// @param roundId The ID of the new round
    /// @param timestamp The timestamp when the round was started
    /// @param drawTimestamp The expected timestamp for the draw
    event NewRoundStarted(uint256 indexed roundId, uint256 timestamp, uint256 drawTimestamp);

    /// @notice Emitted when share tokens are minted
    /// @param user The address of the user who received the minted tokens
    /// @param amount The amount of tokens minted
    /// @param timestamp The timestamp when the tokens were minted
    event ShareTokenMinted(address indexed user, uint256 amount, uint256 timestamp);

    /// @notice Emitted when share tokens are burned
    /// @param amount The amount of tokens burned
    /// @param timestamp The timestamp when the tokens were burned
    event ShareTokenBurned(uint256 amount, uint256 timestamp);

    /// @notice Emitted when yield aggregator is set
    /// @param oldYieldAggregator The address of the old yield aggregator
    /// @param newYieldAggregator The address of the new yield aggregator
    event YieldAggregatorSet(
        address indexed oldYieldAggregator,
        address indexed newYieldAggregator
    );

    /// @notice Sets the lottery contract address
    /// @param _lottery The address of the lottery contract
    function setLottery(address _lottery) external;

    /// @notice Sets the prize pool contract address
    /// @param _prizePool The address of the prize pool contract
    function setPrizePool(address _prizePool) external;

    /// @notice Sets the WETH token address
    /// @param _weth The address of the WETH token
    function setWETH(address _weth) external;

    /// @notice Sets the share token address
    /// @param _shareToken The address of the share token
    function setShareToken(address _shareToken) external;

    /// @notice Sets the yield aggregator address
    /// @param _yieldAggregator The address of the yield aggregator
    function setYieldAggregator(address _yieldAggregator) external;

    /// @notice Returns the deposit information for a specific user in the current round
    /// @param user The address of the user
    /// @return The user's deposit information
    function userDeposits(address user) external view returns (Deposit memory);

    /// @notice Returns the deposit information for a specific user in a specific round
    /// @param user The address of the user
    /// @param roundId The ID of the round
    /// @return The user's deposit information
    function userDeposits(address user, uint256 roundId) external view returns (Deposit memory);

    /// @notice Starts a new lottery round
    /// @dev Can only be called by the lottery contract
    /// @param newRoundId The ID of the new lottery round
    function startNewRound(uint256 newRoundId) external;

    /// @notice Allows users to deposit WETH tokens into the vault for the current round
    /// @param amount WETH代币数量
    function deposit(uint256 amount) external;

    /// @notice 允许任何地址代表用户进行WETH代币存款
    /// @dev 用户需要预先授权调用者使用其WETH代币
    /// @param user 实际用户地址
    /// @param amount WETH代币数量
    function depositFor(address user, uint256 amount) external;

    /// @notice 将WETH代币费用存入收益聚合器
    /// @dev 只能由奖池合约调用，发送者必须预先批准本合约使用其WETH
    /// @param amount 费用金额
    /// @return 操作是否成功
    function depositFeeToYieldAggregator(uint256 amount) external returns (bool);

    /// @notice Allows users to withdraw all their deposited ETH from the current round
    /// @dev Will withdraw the full amount of user's deposit and reset their weight to zero
    function withdraw() external;

    /// @notice Allows users to withdraw all their deposited ETH from a specific round
    /// @param roundId The ID of the lottery round
    /// @dev Will withdraw the full amount of user's deposit and reset their weight to zero
    function withdraw(uint256 roundId) external;

    /// @notice Returns the total number of participants in the current round
    /// @return The number of users in the current lottery round
    function getUserCount() external view returns (uint256);

    /// @notice Returns the total number of participants in a specific round
    /// @param roundId The ID of the lottery round
    /// @return The number of users in the specified lottery round
    function getUserCount(uint256 roundId) external view returns (uint256);

    /// @notice Returns the user address at the given index in the current round
    /// @param index The index of the user in the participants array
    /// @return The address of the user
    function getUser(uint256 index) external view returns (address);

    /// @notice Returns the user address at the given index in a specific round
    /// @param index The index of the user in the participants array
    /// @param roundId The ID of the lottery round
    /// @return The address of the user
    function getUser(uint256 index, uint256 roundId) external view returns (address);

    /// @notice Returns the total amount of ETH deposited in the current round
    /// @return The total amount of ETH in the vault for the current round
    function getDepositTotal() external view returns (uint256);

    /// @notice Returns the total amount of ETH deposited in a specific round
    /// @param roundId The ID of the lottery round
    /// @return The total amount of ETH in the vault for the specified round
    function getDepositTotal(uint256 roundId) external view returns (uint256);

    /// @notice Returns the total amount of ETH deposited across all rounds
    /// @return The total amount of ETH in the vault across all rounds
    function getAllDepositsTotal() external view returns (uint256);

    /// @notice Returns the total weight of all participants in the current round
    /// @return The sum of all users' weights in the current lottery round
    function getTotalWeight() external view returns (uint256);

    /// @notice Returns the total weight of all participants in a specific round
    /// @param roundId The ID of the lottery round
    /// @return The sum of all users' weights in the specified lottery round
    function getTotalWeight(uint256 roundId) external view returns (uint256);

    /// @notice Returns the current active round ID
    /// @return The ID of the current active lottery round
    function getCurrentRoundId() external view returns (uint256);

    /// @notice Returns the WETH token address
    /// @return The address of the WETH token
    function weth() external view returns (address);

    /// @notice 返回权益代币地址
    /// @return 权益代币地址
    function getShareToken() external view returns (address);
}
