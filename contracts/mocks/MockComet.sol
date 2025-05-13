// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IComet.sol";

contract MockComet is IComet {
    using SafeERC20 for IERC20;

    IERC20 public immutable baseToken;
    mapping(address => UserBasic) private _userBasic;
    mapping(address => uint256) private _balances;

    // 年化利率（以 1e18 为基数）
    uint256 public constant INTEREST_RATE = 5e16; // 5% APR
    uint256 public lastAccrualTime;
    uint256 public baseTrackingSupplyIndex;

    constructor(address _baseToken) {
        require(_baseToken != address(0), "Invalid base token address");
        baseToken = IERC20(_baseToken);
        lastAccrualTime = block.timestamp;
        baseTrackingSupplyIndex = 1e18;
    }

    function balanceOf(address account) external view override returns (uint256) {
        UserBasic memory basic = _userBasic[account];
        if (basic.principal == 0) return 0;
        
        uint256 currentTime = block.timestamp;
        if (currentTime == lastAccrualTime) {
            return basic.principal;
        }
        
        uint256 timeElapsed = currentTime - lastAccrualTime;
        uint256 interestFactor = (INTEREST_RATE * timeElapsed) / (365 days);
        uint256 currentIndex = baseTrackingSupplyIndex + ((baseTrackingSupplyIndex * interestFactor) / 1e18);
        return (uint256(basic.principal) * currentIndex) / uint256(basic.baseTrackingIndex);
    }

    function userBasic(address account) external view override returns (UserBasic memory) {
        return _userBasic[account];
    }

    function _accrueInterest() internal {
        uint256 currentTime = block.timestamp;
        if (currentTime == lastAccrualTime) {
            return;
        }

        uint256 timeElapsed = currentTime - lastAccrualTime;
        uint256 interestFactor = (INTEREST_RATE * timeElapsed) / (365 days);
        uint256 newIndex = baseTrackingSupplyIndex + ((baseTrackingSupplyIndex * interestFactor) / 1e18);
        
        // 更新全局状态
        baseTrackingSupplyIndex = newIndex;
        lastAccrualTime = currentTime;
    }

    function withdraw(address asset, uint256 amount) external override {
        require(asset == address(baseToken), "Invalid asset");
        require(_balances[msg.sender] >= amount, "Insufficient balance");

        _accrueInterest();

        _balances[msg.sender] -= amount;
        UserBasic storage basic = _userBasic[msg.sender];
        basic.principal = uint104(_balances[msg.sender]);

        baseToken.safeTransfer(msg.sender, amount);
    }

    function supply(address asset, uint256 amount) external override {
        require(asset == address(baseToken), "Invalid asset");

        _accrueInterest();

        baseToken.safeTransferFrom(msg.sender, address(this), amount);
        _balances[msg.sender] += amount;

        UserBasic storage basic = _userBasic[msg.sender];
        basic.principal = uint104(_balances[msg.sender]);
        basic.baseTrackingIndex = uint64(baseTrackingSupplyIndex);
        basic.assetsIn = 1;
        basic._reserved = 0;
    }
}
