// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IWETH - Wrapped Ether Interface
 * @notice Interface for Wrapped Ether (WETH) contract with methods to convert between ETH and WETH
 */
interface IWETH is IERC20 {
    /**
     * @notice Deposit ETH and receive the same amount of WETH
     * @dev This function is payable and converts the sent ETH to WETH
     */
    function deposit() external payable;

    /**
     * @notice Withdraw ETH by burning WETH
     * @dev Burns WETH tokens and withdraws the corresponding amount of ETH
     * @param amount Amount of WETH to burn and ETH to withdraw
     */
    function withdraw(uint256 amount) external;
}
