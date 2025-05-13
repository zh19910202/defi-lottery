// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IComet {
    struct UserBasic {
        uint104 principal;
        uint64 baseTrackingIndex;
        uint64 baseTrackingAccrued;
        uint16 assetsIn;
        uint8 _reserved;
    }
    

    function balanceOf(address account) external view returns (uint256);
    
    function userBasic(address account) external view returns (UserBasic memory);

    // function accrueAccount(address account) external;

    function withdraw(address asset, uint256 amount) external;

    /// @notice Supply an amount of asset to the protocol
    /// @param asset The address of the asset to supply
    /// @param amount The amount to supply
    function supply(address asset, uint256 amount) external;

    
}