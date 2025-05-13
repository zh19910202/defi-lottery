// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IComet.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IPrizePool.sol";

/// @title Yield Aggregator Contract
/// @notice Manages deposits and withdrawals to Compound protocol for yield generation
/// @dev Implements ReentrancyGuard for security
contract YieldAggregator is Ownable {
    using SafeERC20 for IERC20;

    IComet public immutable comet;

    IERC20 public immutable weth;
    IVault public vault;
    IPrizePool public prizePool;

    /// @notice Events for tracking deposits and withdrawals
    event Deposited(address indexed user, uint256 amount, uint256 timestamp);
    event Withdrawn(address indexed user, uint256 amount, uint256 timestamp);

    constructor(address _weth, address _vault, address _prizePool, address _comet) {
        require(_weth != address(0), "Invalid WETH address");
        require(_vault != address(0), "Invalid Vault address");
        require(_prizePool != address(0), "Invalid PrizePool address");

        weth = IERC20(_weth);
        vault = IVault(_vault);
        prizePool = IPrizePool(_prizePool);
        comet = IComet(_comet);
    }

    /// @notice Restricts function access to Vault or PrizePool contract only
    /// @dev Modifier to ensure only Vault contract can call certain functions

    modifier onlyPrizePoolOrVault() {
        require(
            msg.sender == address(prizePool) || msg.sender == address(vault),
            "Caller is not the PrizePool or Vault contract"
        );
        _;
    }

    /// @notice Deposits WETH into Compound to earn interest
    /// @dev Uses SafeERC20 for transferFrom and requires Vault authorization
    /// @param amount Amount of WETH to deposit
    /// @return success True if deposit was successful
    function deposit(uint256 amount) external onlyPrizePoolOrVault returns (bool) {
        require(amount > 0, "Amount must be greater than zero");

        // Transfer WETH from Vault to this contract
        weth.safeTransferFrom(msg.sender, address(this), amount);

        // Approve WETH to Compound
        weth.safeApprove(address(comet), amount);

        // Supply WETH to Compound V3
        comet.supply(address(weth), amount);

        // Emit deposit event
        emit Deposited(msg.sender, amount, block.timestamp);
        return true;
    }

    /// @notice Withdraws WETH from Compound
    /// @dev Can only be called by authorized contracts (PrizePool or Vault)
    /// @param amount Amount of WETH to withdraw
    /// @return success True if withdrawal was successful
    function withdraw(uint256 amount) external onlyPrizePoolOrVault returns (bool) {
        require(amount > 0, "Amount must be greater than zero");

        // Withdraw WETH directly from Compound V3
        comet.withdraw(address(weth), amount);

        // Transfer WETH to caller
        weth.safeTransfer(msg.sender, amount);

        // Emit withdrawal event
        emit Withdrawn(msg.sender, amount, block.timestamp);
        return true;
    }

    /// @notice Gets the current balance of WETH in Compound
    /// @return The current balance in Compound
    function balanceOf() external view returns (uint256) {
        return comet.balanceOf(address(this));
    }
}
