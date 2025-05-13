// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ILottery.sol";

/**
 * @title ILotteryRouter
 * @notice 彩票系统路由合约的接口定义
 */
interface ILotteryRouter {
    // 系统状态结构体
    struct SystemStatus {
        uint256 currentRoundId;
        uint256 participantCount;
        uint256 totalDeposits;
        uint256 totalWeight;
        uint256 nextDrawTimestamp;
        uint256 lastDrawTimestamp;
    }

    // 用户信息结构体
    struct UserInfo {
        uint256 depositAmount;
        uint256 weight;
        uint256 depositTimestamp;
        bool hasDeposit;
        uint256 shareTokenBalance; // 用户持有的权益代币余额
    }

    /**
     * @notice 设置彩票合约地址
     * @param _lottery 彩票合约地址
     */
    function setLottery(address _lottery) external;

    /**
     * @notice 设置保险库合约地址
     * @param _vault 保险库合约地址
     */
    function setVault(address _vault) external;

    /**
     * @notice 设置奖池合约地址
     * @param _prizePool 奖池合约地址
     */
    function setPrizePool(address _prizePool) external;

    /**
     * @notice 设置权益代币合约地址
     * @param _shareToken 权益代币合约地址
     */
    function setShareToken(address _shareToken) external;

    /**
     * @notice WETH代币存款入口
     * @dev 用户需要预先授权Router合约使用其WETH代币
     * @param amount 要存入的WETH代币数量
     */
    function deposit(uint256 amount) external;

    /**
     * @notice 从当前轮次提款
     */
    function withdraw() external;

    /**
     * @notice 从指定轮次提款
     * @param roundId 轮次ID
     */
    function withdrawFromRound(uint256 roundId) external;

    /**
     * @notice 领取奖金
     * @param roundId 轮次ID
     */
    function claimPrize(uint256 roundId) external;

    /**
     * @notice 获取系统状态
     * @return 系统状态结构体
     */
    function getSystemStatus() external view returns (SystemStatus memory);

    /**
     * @notice 获取用户信息
     * @param user 用户地址
     * @return 用户信息结构体
     */
    function getUserInfo(address user) external view returns (UserInfo memory);
}
