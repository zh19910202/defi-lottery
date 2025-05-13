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

    // 用于测试时接收ETH
    receive() external payable {}
}
