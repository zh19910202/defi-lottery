// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockComet {
    mapping(address => uint256) public balances;

    function supply(address asset, uint256 amount) external {
        balances[msg.sender] += amount;
    }

    function withdraw(address asset, uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    // 用于测试 - 直接设置账户余额
    function setBalance(address account, uint256 amount) external {
        balances[account] = amount;
    }

    // Compound V3的userBasic方法 - 返回用户基本信息
    function userBasic(address user) external view returns (uint104 principal, uint64 baseTrackingIndex, uint64 baseTrackingAccrued, uint16 assetsIn, uint8 _reserved) {
        // 返回模拟数据，主要是principal余额
        principal = uint104(balances[user]);
        baseTrackingIndex = 0;
        baseTrackingAccrued = 0; 
        assetsIn = 0;
        _reserved = 0;
    }

    // 用于测试时接收ETH
    receive() external payable {}
}
