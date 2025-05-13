// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ILotteryRouter.sol";
import "./interfaces/ILottery.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IPrizePool.sol";
import "./interfaces/IVaultShareToken.sol";

/**
 * @title LotteryRouter
 * @notice 彩票系统的中央路由合约，处理用户交互和跨合约协调
 */
contract LotteryRouter is ILotteryRouter, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // 系统组件地址
    address public lottery;
    address public vault;
    address public prizePool;
    address public shareToken;

    // 事件
    event ComponentUpdated(string indexed componentName, address indexed newAddress);
    event DepositRouted(address indexed user, uint256 amount);
    event WithdrawalInstructionIssued(address indexed user);
    event PrizeClaimRouted(address indexed winner, uint256 amount, uint256 roundId);

    /**
     * @notice 设置彩票合约地址
     * @param _lottery 新的彩票合约地址
     */
    function setLottery(address _lottery) external onlyOwner {
        require(_lottery != address(0), "Invalid lottery address");
        lottery = _lottery;
        emit ComponentUpdated("lottery", _lottery);
    }

    /**
     * @notice 设置保险库合约地址
     * @param _vault 新的保险库合约地址
     */
    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid vault address");
        vault = _vault;
        emit ComponentUpdated("vault", _vault);
    }

    /**
     * @notice 设置奖池合约地址
     * @param _prizePool 新的奖池合约地址
     */
    function setPrizePool(address _prizePool) external onlyOwner {
        require(_prizePool != address(0), "Invalid prizePool address");
        prizePool = _prizePool;
        emit ComponentUpdated("prizePool", _prizePool);
    }

    /**
     * @notice 手动设置shareToken地址（仅在无法通过Vault自动获取时使用）
     * @param _shareToken 新的shareToken地址
     */
    function setShareToken(address _shareToken) external onlyOwner {
        require(_shareToken != address(0), "Invalid shareToken address");
        shareToken = _shareToken;
        emit ComponentUpdated("shareToken", _shareToken);
    }

    /**
     * @notice WETH代币存款入口
     * @dev 用户需要预先授权Router合约使用其WETH代币
     * @param amount 要存入的WETH代币数量
     */
    function deposit(uint256 amount) external nonReentrant {
        require(vault != address(0), "Vault not configured");
        require(amount > 0, "Must deposit WETH tokens");

        // 获取weth地址
        address weth = IVault(vault).weth();
        require(weth != address(0), "WETH not configured");

        // 从用户转移WETH到本合约
        IERC20(weth).safeTransferFrom(msg.sender, address(this), amount);

        // weth转移到Vault合约
        IERC20(weth).safeTransfer(vault, amount);

        // 调用vault的depositFor函数
        (bool success, ) = vault.call(
            abi.encodeWithSignature("depositFor(address,uint256)", msg.sender, amount)
        );
        require(success, "WETH deposit forwarding failed");

        emit DepositRouted(msg.sender, amount);
    }

    /**
     * @notice 用户取款功能，直接调用Vault合约的withdraw方法
     * @dev 路由层只负责业务调度，校验由业务层处理
     */
    function withdraw() external override {
        require(vault != address(0), "Vault not configured");
        require(shareToken != address(0), "ShareToken not configured");

        // 获取用户的存款信息
        IVault.Deposit memory userDeposit = IVault(vault).userDeposits(msg.sender);
        require(userDeposit.amount > 0, "No deposit to withdraw");
        _withdraw(userDeposit.amount, ILottery(lottery).getCurrentRoundId());
    }

    /**
     * @notice 从特定轮次取款，直接调用Vault合约的withdraw(uint256)方法
     * @param roundId 要取款的轮次ID
     * @dev 路由层只负责业务调度，校验由业务层处理
     */
    function withdrawFromRound(uint256 roundId) external override {
        require(vault != address(0), "Vault not configured");
        require(shareToken != address(0), "ShareToken not configured");

        // 调用Vault合约获取用户在指定轮次的存款信息
        (bool checkSuccess, bytes memory data) = vault.staticcall(
            abi.encodeWithSignature("userDeposits(address,uint256)", msg.sender, roundId)
        );
        require(checkSuccess, "Failed to get deposit info");

        // 解码存款信息
        IVault.Deposit memory userDeposit = abi.decode(data, (IVault.Deposit));
        require(userDeposit.amount > 0, "No deposit in this round");

        _withdraw(userDeposit.amount, roundId);
    }

    function _withdraw(uint256 amount, uint256 roundId) internal nonReentrant {
        // 从用户转移shareToken到本合约
        IERC20(shareToken).safeTransferFrom(msg.sender, address(this), amount);

        // 将shareToken转移到Vault合约
        IERC20(shareToken).safeTransfer(vault, amount);

        // 直接调用Vault合约的withdraw(uint256)方法
        (bool withdrawSuccess, ) = vault.call(
            abi.encodeWithSignature("withdrawFor(uint256,address)", roundId,msg.sender)
        );
        require(withdrawSuccess, "Withdrawal failed");

        emit WithdrawalInstructionIssued(msg.sender);
    }

    /**
     * @notice 用户领取奖金入口
     * @param roundId 要领取奖金的轮次ID
     */
    function claimPrize(uint256 roundId) external override nonReentrant {
        require(prizePool != address(0), "PrizePool not configured");
        require(lottery != address(0), "Lottery not configured");

        // 检查用户是否是该轮次的获胜者
        ILottery.LotteryRound memory round = ILottery(lottery).lotteryRound(roundId);
        require(round.winner == msg.sender, "Only winner can claim prize");
        require(!round.isClaimed, "Prize already claimed");

        // 调用奖池合约进行奖金发放
        IPrizePool(prizePool).claimPrize(roundId);

        emit PrizeClaimRouted(msg.sender, round.prizeValue, roundId);
    }

    /**
     * @notice 获取当前系统状态
     * @return 包含系统当前状态的结构体
     */
    function getSystemStatus() external view override returns (SystemStatus memory) {
        require(lottery != address(0) && vault != address(0), "System not fully configured");

        uint256 currentRoundId = IVault(vault).getCurrentRoundId();
        uint256 userCount = IVault(vault).getUserCount();
        uint256 totalDeposits = IVault(vault).getDepositTotal();
        uint256 totalWeight = IVault(vault).getTotalWeight();
        uint256 nextDrawTime = ILottery(lottery).nextDrawTimestamp();

        return
            SystemStatus({
                currentRoundId: currentRoundId,
                participantCount: userCount,
                totalDeposits: totalDeposits,
                totalWeight: totalWeight,
                nextDrawTimestamp: nextDrawTime,
                lastDrawTimestamp: block.timestamp - (nextDrawTime - 30 days) // 估算上次开奖时间
            });
    }

    /**
     * @notice 获取用户信息
     * @param user 要查询的用户地址
     * @return 包含用户当前状态的结构体
     */
    function getUserInfo(address user) external view override returns (UserInfo memory) {
        require(vault != address(0), "Vault not configured");

        IVault.Deposit memory userDeposit = IVault(vault).userDeposits(user);

        uint256 shareBalance = 0;
        if (shareToken != address(0)) {
            shareBalance = IERC20(shareToken).balanceOf(user);
        }

        return
            UserInfo({
                depositAmount: uint256(userDeposit.amount),
                weight: uint256(userDeposit.weight),
                depositTimestamp: uint256(userDeposit.timestamp),
                hasDeposit: userDeposit.amount > 0,
                shareTokenBalance: shareBalance
            });
    }

    /**
     * @notice 手动触发彩票抽奖（仅限所有者使用）
     * @dev 通常抽奖由Chainlink Automation自动触发，此函数仅用于测试或紧急情况
     */
    function triggerDraw() external onlyOwner {
        require(lottery != address(0), "Lottery not configured");

        (bool success, ) = lottery.call(abi.encodeWithSignature("performUpkeep(bytes)", ""));
        require(success, "Trigger draw failed");
    }

    // 接收ETH的函数
    receive() external payable {
        // 拒绝接收任何ETH转账，因为系统现在只接受WETH代币
        revert("System only accepts WETH tokens, not ETH");
    }
}
