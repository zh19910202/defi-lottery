// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPrizePool.sol";
import "./interfaces/ILottery.sol";
import "./interfaces/IYieldAggregator.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IWETH.sol";

contract PrizePool is IPrizePool, Ownable {
    using SafeERC20 for IERC20;

    IYieldAggregator public yieldAggregator;
    address public vault;
    ILottery public lottery;
    address public weth;

    // 费率，以基点表示 (1% = 100)
    uint256 public feeRate = 500; // 默认5%

    // 最大费率限制 (20%)
    uint256 public constant MAX_FEE_RATE = 2000;

    constructor(address _lottery, uint256 _feeRate) {
        require(_lottery != address(0), "Invalid lottery address");
        lottery = ILottery(_lottery);
        _setFeeRate(_feeRate);
    }

    /**
     * @notice 向奖池添加ETH
     * @dev 现在已经不再接受ETH，而是接受WETH，所以这个函数会revert
     */
    function addToPrizePool() external payable override {
        // 由于系统现在使用WETH而不是ETH，我们拒绝直接添加ETH
        revert(
            "System now uses WETH tokens instead of ETH. Please use depositFeeFromTokens function in Vault."
        );
    }

    function setYieldAggregator(address _yieldAggregator) external onlyOwner {
        require(_yieldAggregator != address(0), "Invalid YieldAggregator address");
        address oldYieldAggregator = address(yieldAggregator);
        yieldAggregator = IYieldAggregator(_yieldAggregator);
        emit YieldAggregatorSet(oldYieldAggregator, _yieldAggregator);
    }

    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Invalid vault address");
        vault = _vault;
        emit VaultSet(_vault);
    }

    function setWETH(address _weth) external onlyOwner {
        require(_weth != address(0), "Invalid WETH address");
        weth = _weth;
    }

    /**
     * @notice 更新奖金费率
     * @param _feeRate 新的费率（以基点表示，例如 500 表示 5%）
     */
    function setFeeRate(uint256 _feeRate) external onlyOwner {
        _setFeeRate(_feeRate);
    }

    function _setFeeRate(uint256 _feeRate) internal {
        require(_feeRate <= MAX_FEE_RATE, "Fee rate too high");
        uint256 oldFeeRate = feeRate;
        feeRate = _feeRate;
        emit FeeRateUpdated(oldFeeRate, _feeRate);
    }

    function claimPrize(uint256 lotteryId) external override {
        require(address(yieldAggregator) != address(0), "YieldAggregator not set");
        require(vault != address(0), "Vault not set");
        require(weth != address(0), "WETH not set");

        ILottery.LotteryRound memory round = lottery.lotteryRound(lotteryId);
        require(round.winner == msg.sender, "Not the winner");
        require(!round.isClaimed, "Prize already claimed");

        ILottery(lottery).updateIsClaimed(lotteryId);

        // 计算要收取的费用
        uint256 feeAmount = (round.prizeValue * feeRate) / 10000;
        uint256 payoutAmount = round.prizeValue - feeAmount;

        // 从聚合器提取WETH代币
        bool withdrawSuccess = yieldAggregator.withdraw(round.prizeValue);
        require(withdrawSuccess, "Withdrawal from yield aggregator failed");

        // 如果有费用，将费用部分批准给Vault合约
        if (feeAmount > 0) {
            // 批准Vault合约从本合约转移WETH
            IERC20(weth).safeApprove(vault, feeAmount);

            // 将费用存入聚合器
            (bool depositSuccess, ) = vault.call(
                abi.encodeWithSignature("deposit(uint256)", feeAmount)
            );
            require(depositSuccess, "Fee deposit failed");
            emit FeeCollected(feeAmount);
        }

        // 将剩余WETH发送给获奖者
        IERC20(weth).safeTransfer(round.winner, payoutAmount);

        emit PrizeClaimed(round.winner, lotteryId, payoutAmount);
    }

    function getPrizePoolAmount() external view override returns (uint256) {
        // 只从聚合器获取余额
        if (address(yieldAggregator) != address(0)) {
            return yieldAggregator.balanceOf() - IVault(vault).getDepositTotal();
        }

        // 如果聚合器未设置，返回0（不再使用本合约持有ETH）
        return 0;
    }
}
