// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockCToken is ERC20 {
    IERC20 public underlying;

    constructor(address _underlying) ERC20("Mock cToken", "mcToken") {
        underlying = IERC20(_underlying);
    }

    function mint(uint256 amount) external returns (uint256) {
        require(
            underlying.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        _mint(msg.sender, amount);
        return 0;
    }

    function redeem(uint256 redeemTokens) external returns (uint256) {
        require(balanceOf(msg.sender) >= redeemTokens, "Insufficient balance");
        _burn(msg.sender, redeemTokens);
        require(
            underlying.transfer(msg.sender, redeemTokens),
            "Transfer failed"
        );
        return 0;
    }
}
