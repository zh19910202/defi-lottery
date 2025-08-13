// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IGovernance Interface
/// @notice Interface for the Governance contract
interface IGovernance {
    /// @notice Schedule a new operation with timelock
    /// @param target Target contract address
    /// @param data Encoded function call data
    /// @return operationId Unique identifier for the operation
    function scheduleOperation(address target, bytes calldata data) external returns (bytes32);
    
    /// @notice Confirm a pending operation
    /// @param operationId ID of the operation to confirm
    function confirmOperation(bytes32 operationId) external;
    
    /// @notice Execute a confirmed operation after timelock period
    /// @param operationId ID of the operation to execute
    function executeOperation(bytes32 operationId) external;
    
    /// @notice Cancel a pending operation
    /// @param operationId ID of the operation to cancel
    function cancelOperation(bytes32 operationId) external;
    
    /// @notice Check if a signer has confirmed an operation
    /// @param operationId ID of the operation
    /// @param signer Address of the signer
    /// @return Whether the signer has confirmed the operation
    function hasConfirmed(bytes32 operationId, address signer) external view returns (bool);
    
    /// @notice Get operation details
    /// @param operationId ID of the operation
    /// @return target Target contract address
    /// @return data Encoded function call data
    /// @return executeAfter Timestamp when operation can be executed
    /// @return executed Whether operation has been executed
    /// @return confirmations Number of confirmations received
    function getOperation(bytes32 operationId) external view returns (
        address target,
        bytes memory data,
        uint256 executeAfter,
        bool executed,
        uint256 confirmations
    );
}