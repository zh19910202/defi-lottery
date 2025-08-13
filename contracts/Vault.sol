// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IYieldAggregator.sol";
import "./interfaces/ILottery.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IVaultShareToken.sol";
import "./interfaces/IGovernance.sol";
import "./security/EmergencyPause.sol";
import "./lib/LuckyValueCalculator.sol";

/// @title Vault Contract
/// @notice Manages user deposits and withdrawals in the lottery system
/// @dev Implements reentrancy protection and accepts ETH deposits
contract Vault is IVault, ReentrancyGuard, EmergencyPause {
    using SafeERC20 for IERC20;

    // 彩票合约地
    address public lottery;

    // 奖池合约地址
    address public prizePool;

    // WETH代币地址
    address private _wethToken;

    // 权益代币地址
    address public shareToken;

    address public yieldAggregator;
    
    /// @notice Governance contract address
    address public governance;

    // 轮次ID到轮次数据的映射
    mapping(uint256 => DepositRound) private _depositRounds;

    /// @notice Total deposits of all users in the protocol (in wei)
    uint256 private _depositTotal;

    // Minimum deposit amount: 0.1 ETH
    uint256 public constant MIN_DEPOSIT = 0.1 ether;

    // Maximum deposit amount: 1 ETH
    uint256 public constant MAX_DEPOSIT = 1 ether;

    // 这些事件在IVault接口中已定义，保留接口没有定义的事件
    event WETHDeposited(uint256 amount, uint256 timestamp);
    event WETHWithdrawn(uint256 amount, uint256 timestamp);

    // 每期彩票的数据结构
    struct DepositRound {
        uint256 totalDeposits; // 本轮总存款
        uint256 participantCount; // 本轮参与人数
        address[] participants; // 本轮参与者
        mapping(address => Deposit) deposits; // 用户存款信息
        mapping(address => bool) hasParticipated; // 用户是否参与
        mapping(address => uint256) participantIndex; // 参与者在数组中的索引
        bool isActive; // 本轮是否激活
        uint256 drawTimestamp; // 本轮预计开奖时间
        uint256 totalWeight; // 本轮所有用户权重之和
    }

    constructor(address _emergencyGuardian) EmergencyPause(_emergencyGuardian) {
        _depositRounds[0].isActive = true;
        _depositRounds[0].totalWeight = 0; // 初始化总权重为0
        emit NewRoundStarted(0, block.timestamp, 0); // 初始时不知道开奖时间
    }

    /// @notice Sets the lottery contract address
    /// @param _lottery The address of the lottery contract
    function setLottery(address _lottery) external override onlyOwner {
        require(_lottery != address(0), "Invalid lottery address");
        address previousLottery = lottery;
        lottery = _lottery;
        emit LotterySet(previousLottery, _lottery);
    }

    /// @notice Modifier to check if caller is owner or governance
    modifier onlyOwnerOrGovernance() {
        require(msg.sender == owner() || msg.sender == governance, "Not authorized");
        _;
    }
    
    /// @notice Set governance contract address
    /// @param _governance Governance contract address
    function setGovernance(address _governance) external onlyOwner {
        require(_governance != address(0), "Invalid governance address");
        governance = _governance;
        emit GovernanceSet(governance, _governance);
    }

    /// @notice 设置奖池合约地址
    /// @param _prizePool 奖池合约地址
    function setPrizePool(address _prizePool) external onlyOwnerOrGovernance {
        require(_prizePool != address(0), "Invalid prizePool address");
        address previousPrizePool = prizePool;
        prizePool = _prizePool;
        emit PrizePoolSet(previousPrizePool, _prizePool);
    }

    /// @notice 设置WETH代币地址
    /// @param _weth WETH代币地址
    function setWETH(address _weth) external onlyOwnerOrGovernance {
        require(_weth != address(0), "Invalid WETH address");
        address previousWETH = _wethToken;
        _wethToken = _weth;
        emit WETHSet(previousWETH, _weth);
    }

    /// @notice 设置权益代币地址
    /// @param _shareToken 权益代币地址
    function setShareToken(address _shareToken) external onlyOwnerOrGovernance {
        require(_shareToken != address(0), "Invalid shareToken address");
        address previousShareToken = shareToken;
        shareToken = _shareToken;
        emit ShareTokenSet(previousShareToken, _shareToken);
    }

    function setYieldAggregator(address _yieldAggregator) external onlyOwnerOrGovernance {
        require(_yieldAggregator != address(0), "Invalid YieldAggregator address");
        address oldYieldAggregator = yieldAggregator;
        yieldAggregator = _yieldAggregator;
        emit YieldAggregatorSet(oldYieldAggregator, _yieldAggregator);
    }

    /// @notice 获取用户在特定轮次的存款信息
    /// @param user 用户地址
    /// @param roundId 轮次ID
    /// @return 用户在该轮次的存款信息
    function userDeposits(address user, uint256 roundId) external view returns (Deposit memory) {
        return _depositRounds[roundId].deposits[user];
    }

    /// @notice 获取用户在当前轮次的存款信息
    /// @param user 用户地址
    /// @return 用户在当前轮次的存款信息
    function userDeposits(address user) external view override returns (Deposit memory) {
        uint _activeRoundId = ILottery(lottery).getCurrentRoundId();
        return _depositRounds[_activeRoundId].deposits[user];
    }

    /// @notice 将WETH代币费用存入收益聚合器（从代币中直接提取）
    /// @dev 只能由奖池合约调用，发送者必须预先批准本合约使用其WETH
    /// @param amount 费用金额
    /// @return 操作是否成功
    function depositFeeToYieldAggregator(uint256 amount) external returns (bool) {
        require(msg.sender == prizePool, "Only PrizePool");
        require(amount > 0, "Amount must be greater than 0");
        require(yieldAggregator != address(0), "YieldAggregator not set");
        require(_wethToken != address(0), "WETH not set");

        // 从PrizePool转移WETH代币
        IERC20(_wethToken).safeTransferFrom(msg.sender, address(this), amount);

        // 批准YieldAggregator合约使用WETH
        IERC20(_wethToken).approve(yieldAggregator, amount);

        // 调用收益聚合器的deposit方法
        bool success = IYieldAggregator(yieldAggregator).deposit(amount);
        require(success, "Deposit to yield aggregator failed");

        // 发出事件
        emit FeeDeposited(amount, block.timestamp);
        return true;
    }

    /// @notice 开始新的一轮彩票
    /// @dev 只能由彩票合约调用
    /// @param newRoundId 新轮次的ID
    function startNewRound(uint256 newRoundId) external override {
        require(msg.sender == lottery, "Only lottery");

        // 获取下一次开奖时间
        uint256 nextDrawTimestamp = ILottery(lottery).nextDrawTimestamp();

        // 结束当前轮次
        uint256 _activeRoundId = ILottery(lottery).getCurrentRoundId();
        _depositRounds[_activeRoundId].isActive = false;

        // 开始新轮次
        _depositRounds[newRoundId].isActive = true;
        _depositRounds[newRoundId].drawTimestamp = nextDrawTimestamp;
        _depositRounds[newRoundId].totalWeight = 0; // 初始化新轮次的总权重为0

        emit NewRoundStarted(newRoundId, block.timestamp, nextDrawTimestamp);
    }

    /// @notice Deposit between 0.1 and 1 ETH worth of WETH tokens to enter the lottery
    /// @param amount WETH代币数量
    function deposit(uint256 amount) external override nonReentrant whenNotPaused whenFunctionNotPaused(bytes4(keccak256("deposit(uint256)"))) {
        // 处理存款逻辑
        _depositCommon(msg.sender, amount);
    }

    /// @notice 允许任何地址代表用户进行WETH代币存款
    /// @dev 不再限制只能由路由合约调用
    /// @param user 实际用户地址
    /// @param amount WETH代币数量
    function depositFor(address user, uint256 amount) external nonReentrant whenNotPaused whenFunctionNotPaused(bytes4(keccak256("depositFor(address,uint256)"))) {
        // 处理存款逻辑
        _depositCommon(user, amount);
    }

    /// @notice 通用内部存款逻辑实现
    /// @param user 存款用户地址
    /// @param amount 存款金额（以ETH/WETH计价）
    function _depositCommon(address user, uint256 amount) internal {
        require(user != address(0), "Invalid user address");
        require(_wethToken != address(0), "WETH not set");
        require(amount >= MIN_DEPOSIT, "Min deposit 0.1 ETH");
        require(amount <= MAX_DEPOSIT, "Max deposit 1 ETH");
        
        // 从用户转移WETH代币到合约
        IERC20(_wethToken).safeTransferFrom(user, address(this), amount);
        // 获取当前轮次ID
        uint256 _activeRoundId = ILottery(lottery).getCurrentRoundId();
        DepositRound storage round = _depositRounds[_activeRoundId];

        // 检查用户是否已经在当前轮次参与过
        require(!round.hasParticipated[user], "Already participated");

        // 更新用户存款信息
        Deposit storage userDeposit = round.deposits[user];

        // 添加用户到参与者列表
        round.participantIndex[user] = round.participants.length;
        round.participants.push(user);
        round.hasParticipated[user] = true;
        round.participantCount++;

        // 更新金额和时间戳
        userDeposit.amount = uint128(amount);
        userDeposit.timestamp = uint32(block.timestamp);

        // 计算权重 - 基于存款时间和金额
        uint256 drawTimestamp = round.drawTimestamp;

        // 如果我们不知道开奖时间，从彩票合约获取
        if (drawTimestamp == 0) {
            drawTimestamp = ILottery(lottery).nextDrawTimestamp();
            round.drawTimestamp = drawTimestamp; // 缓存开奖时间
        }

        // 计算从现在到开奖时间的时间间隔
        uint256 timeUntilDraw = 0;
        if (drawTimestamp > block.timestamp) {
            timeUntilDraw = drawTimestamp - block.timestamp;
        }

        // 计算权重
        uint256 weight = LuckyValueCalculator.calculateLuckyValue(amount, timeUntilDraw);
        
        // Scale down weight if it exceeds uint96 maximum to prevent overflow
        if (weight > type(uint96).max) {
            weight = type(uint96).max;
        }
        userDeposit.weight = uint96(weight);

        // Check for overflow when adding to total weight
        require(round.totalWeight + weight >= round.totalWeight, "Total weight overflow");
        round.totalWeight += weight;

        // 更新轮次和全局总存款
        round.totalDeposits += amount;
        _depositTotal += amount;

        // 批准YieldAggregator合约使用WETH
        IERC20(_wethToken).approve(yieldAggregator, amount);

        // 调用收益聚合器的deposit方法
        bool success = IYieldAggregator(yieldAggregator).deposit(amount);
        require(success, "Deposit to yield aggregator failed");

        // 更新Lottery合约中的排序求和树
        if (lottery != address(0)) {
            try ILottery(lottery).updateUserWeight(user, weight) {
                // 成功更新权重
            } catch {
                // 如果失败，继续执行，不影响存款流程
            }
        }

        // 铸造等量的权益代币给用户
        if (shareToken != address(0)) {
            IVaultShareToken(shareToken).mint(user, amount);
            emit ShareTokenMinted(user, amount, block.timestamp);
        }

        // 发出事件
        emit Deposited(user, amount, block.timestamp, _activeRoundId);
    }

    // 从当前轮次取款
    function withdraw() external override nonReentrant whenFunctionNotPaused(bytes4(keccak256("withdraw()"))) {
        // 获取用户存款金额
        uint256 _activeRoundId = ILottery(lottery).getCurrentRoundId();
        // 调用内部逻辑进行全额取款
        _withdrawFromRound(msg.sender, _activeRoundId);
    }

    // 从特定轮次取款
    function withdraw(uint256 roundId) external override nonReentrant whenFunctionNotPaused(bytes4(keccak256("withdraw(uint256)"))) {
        // 调用内部逻辑进行全额取款
        _withdrawFromRound(msg.sender, roundId);
    }

    function withdrawFor(uint256 roundId, address to) external nonReentrant whenFunctionNotPaused(bytes4(keccak256("withdrawFor(uint256,address)"))) {
        // 调用内部逻辑进行全额取款，将资金发送到指定的地址
        _withdrawFromRound(to, roundId);
    }

    // 内部取款函数实现
    function _withdrawFromRound(address to, uint256 roundId) internal {
        // 否持有足够的权益代币
        require(shareToken != address(0), "ShareToken not set");
        require(_wethToken != address(0), "WETH not set");
        require(yieldAggregator != address(0), "YieldAggregator not set");
        
        uint256 _activeRoundId = ILottery(lottery).getCurrentRoundId();
        require(roundId <= _activeRoundId, "Invalid round ID");
        
        DepositRound storage round = _depositRounds[roundId];
        Deposit storage userDeposit = round.deposits[to];
        uint256 fullAmount = userDeposit.amount;
        require(fullAmount > 0, "No deposit to withdraw");
        require(
            IERC20(shareToken).balanceOf(to) >= fullAmount,
            "User has insufficient share tokens"
        );
        require(round.hasParticipated[to], "No participation in this round");
        
        // Store state changes before external calls to prevent reentrancy
        uint256 withdrawAmount = fullAmount;
        uint256 userWeight = userDeposit.weight;
        
        // Clear user deposit state first
        userDeposit.amount = 0;
        userDeposit.weight = 0;
        
        // Update round totals
        round.totalDeposits -= withdrawAmount;
        _depositTotal -= withdrawAmount;
        
        // Update total weight
        if (userWeight > 0) {
            round.totalWeight = round.totalWeight > userWeight ? round.totalWeight - userWeight : 0;
        }
        
        // Remove from participants if round is active
        if (round.isActive) {
            _removeParticipant(to, roundId);
        }
        
        // Now perform external calls after state updates
        // Transfer share tokens from user to vault
        IERC20(shareToken).safeTransferFrom(to, address(this), fullAmount);

        // Burn ShareToken
        IVaultShareToken(shareToken).burn(withdrawAmount);
        emit ShareTokenBurned(withdrawAmount, block.timestamp);

        // Update Lottery contract weight if this is the active round
        if (roundId == _activeRoundId && lottery != address(0)) {
            try ILottery(lottery).updateUserWeight(to, 0) {
                // Successfully updated weight
            } catch {
                // If failed, continue execution without affecting withdrawal
            }
        }

        // 从YieldAggregator提取WETH代币
        bool withdrawSuccess = IYieldAggregator(yieldAggregator).withdraw(withdrawAmount);
        require(withdrawSuccess, "Withdrawal from yield aggregator failed");

        // 直接将WETH代币转账给用户
        IERC20(_wethToken).safeTransfer(to, withdrawAmount);

        // 发出事件
        emit Withdrawn(to, withdrawAmount, block.timestamp, roundId);
    }

    // 从参与者列表中移除用户
    function _removeParticipant(address user, uint256 roundId) internal {
        DepositRound storage round = _depositRounds[roundId];
        uint256 index = round.participantIndex[user];
        uint256 lastIndex = round.participants.length - 1;

        if (index != lastIndex) {
            address lastParticipant = round.participants[lastIndex];
            round.participants[index] = lastParticipant;
            round.participantIndex[lastParticipant] = index;
        }

        round.participants.pop();
        delete round.participantIndex[user];
        round.hasParticipated[user] = false;
        round.participantCount--;
    }

    // 获取特定轮次的参与者总数
    function getUserCount(uint256 roundId) external view returns (uint256) {
        return _depositRounds[roundId].participantCount;
    }

    // 获取当前轮次的参与者总数
    function getUserCount() external view override returns (uint256) {
        uint256 _activeRoundId = ILottery(lottery).getCurrentRoundId();
        return _depositRounds[_activeRoundId].participantCount;
    }

    // 获取特定轮次中指定索引的参与者地址
    function getUser(uint256 index, uint256 roundId) external view returns (address) {
        require(index < _depositRounds[roundId].participants.length, "Index out of bounds");
        return _depositRounds[roundId].participants[index];
    }

    // 获取当前轮次中指定索引的参与者地址
    function getUser(uint256 index) external view override returns (address) {
        uint256 _activeRoundId = ILottery(lottery).getCurrentRoundId();
        require(index < _depositRounds[_activeRoundId].participants.length, "Index out of bounds");
        return _depositRounds[_activeRoundId].participants[index];
    }

    // 获取特定轮次的总存款
    function getDepositTotal(uint256 roundId) external view returns (uint256) {
        return _depositRounds[roundId].totalDeposits;
    }

    // 获取当前轮次的总存款
    function getDepositTotal() external view override returns (uint256) {
        uint256 _activeRoundId = ILottery(lottery).getCurrentRoundId();
        return _depositRounds[_activeRoundId].totalDeposits;
    }

    // 获取全局总存款
    function getAllDepositsTotal() external view returns (uint256) {
        return _depositTotal;
    }

    // 获取特定轮次的总权重
    function getTotalWeight(uint256 roundId) external view returns (uint256) {
        return _depositRounds[roundId].totalWeight;
    }

    // 获取当前轮次的总权重
    function getTotalWeight() external view returns (uint256) {
        uint256 _activeRoundId = ILottery(lottery).getCurrentRoundId();
        return _depositRounds[_activeRoundId].totalWeight;
    }

    // 接收ETH的函数
    receive() external payable {
        // 拒绝所有ETH转账，系统只接受WETH代币
        revert(
            "This contract does not accept ETH. Please use WETH tokens instead and call the deposit or depositFor functions."
        );
    }

    // 获取当前轮次ID
    function getCurrentRoundId() external view override returns (uint256) {
        return ILottery(lottery).getCurrentRoundId();
    }

    // 查询WETH地址
    function weth() external view override returns (address) {
        return _wethToken;
    }

    // 查询权益代币地址
    function getShareToken() external view override returns (address) {
        return shareToken;
    }

    function getTotalDeposits(uint256 roundId) external view returns (uint256) {
        return _depositRounds[roundId].totalDeposits;
    }

    function getCurrentTotalDeposits() external view returns (uint256) {
        uint256 roundId = ILottery(lottery).getCurrentRoundId();
        return _depositRounds[roundId].totalDeposits;
    }

    function getTotalParticipantCount(uint256 roundId) external view returns (uint256) {
        return _depositRounds[roundId].participantCount;
    }

    function getCurrentTotalParticipantCount() external view returns (uint256) {
        uint256 roundId = ILottery(lottery).getCurrentRoundId();
        return _depositRounds[roundId].participantCount;
    }
}
