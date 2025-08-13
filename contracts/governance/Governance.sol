// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title Governance Contract for DeFi Lottery
/// @notice Implements timelock and multi-signature governance to reduce centralization risks
/// @dev Uses a timelock mechanism for critical operations and allows multiple signers
contract Governance is Ownable, ReentrancyGuard {
    /// @notice Minimum delay for timelock operations (24 hours)
    uint256 public constant MIN_DELAY = 24 hours;
    
    /// @notice Maximum delay for timelock operations (30 days)
    uint256 public constant MAX_DELAY = 30 days;
    
    /// @notice Current timelock delay
    uint256 public timelockDelay;
    
    /// @notice Minimum number of signatures required for operations
    uint256 public requiredSignatures;
    
    /// @notice Total number of authorized signers
    uint256 public totalSigners;
    
    /// @notice Mapping of authorized signers
    mapping(address => bool) public isAuthorizedSigner;
    
    /// @notice Array of all authorized signers
    address[] public authorizedSigners;
    
    /// @notice Struct for pending operations
    struct PendingOperation {
        address target;
        bytes data;
        uint256 executeAfter;
        bool executed;
        uint256 confirmations;
        mapping(address => bool) confirmed;
    }
    
    /// @notice Mapping of operation ID to pending operations
    mapping(bytes32 => PendingOperation) public pendingOperations;
    
    /// @notice Array of all pending operation IDs
    bytes32[] public pendingOperationIds;
    
    /// @notice Events
    event OperationScheduled(bytes32 indexed operationId, address indexed target, bytes data, uint256 executeAfter);
    event OperationConfirmed(bytes32 indexed operationId, address indexed signer);
    event OperationExecuted(bytes32 indexed operationId, address indexed target, bytes data);
    event OperationCancelled(bytes32 indexed operationId);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event RequiredSignaturesUpdated(uint256 oldRequired, uint256 newRequired);
    event TimelockDelayUpdated(uint256 oldDelay, uint256 newDelay);
    
    /// @notice Constructor
    /// @param _initialSigners Array of initial authorized signers
    /// @param _requiredSignatures Number of signatures required for operations
    /// @param _timelockDelay Initial timelock delay
    constructor(
        address[] memory _initialSigners,
        uint256 _requiredSignatures,
        uint256 _timelockDelay
    ) {
        require(_initialSigners.length >= _requiredSignatures, "Not enough initial signers");
        require(_requiredSignatures > 0, "Required signatures must be > 0");
        require(_timelockDelay >= MIN_DELAY && _timelockDelay <= MAX_DELAY, "Invalid timelock delay");
        
        // Add initial signers
        for (uint256 i = 0; i < _initialSigners.length; i++) {
            require(_initialSigners[i] != address(0), "Invalid signer address");
            require(!isAuthorizedSigner[_initialSigners[i]], "Duplicate signer");
            
            isAuthorizedSigner[_initialSigners[i]] = true;
            authorizedSigners.push(_initialSigners[i]);
        }
        
        totalSigners = _initialSigners.length;
        requiredSignatures = _requiredSignatures;
        timelockDelay = _timelockDelay;
    }
    
    /// @notice Modifier to check if caller is authorized signer
    modifier onlyAuthorizedSigner() {
        require(isAuthorizedSigner[msg.sender], "Not an authorized signer");
        _;
    }
    
    /// @notice Schedule a new operation with timelock
    /// @param target Target contract address
    /// @param data Encoded function call data
    /// @return operationId Unique identifier for the operation
    function scheduleOperation(
        address target,
        bytes calldata data
    ) external onlyAuthorizedSigner returns (bytes32) {
        require(target != address(0), "Invalid target address");
        
        bytes32 operationId = keccak256(abi.encodePacked(target, data, block.timestamp, msg.sender));
        require(pendingOperations[operationId].executeAfter == 0, "Operation already exists");
        
        uint256 executeAfter = block.timestamp + timelockDelay;
        
        PendingOperation storage operation = pendingOperations[operationId];
        operation.target = target;
        operation.data = data;
        operation.executeAfter = executeAfter;
        operation.executed = false;
        operation.confirmations = 1;
        operation.confirmed[msg.sender] = true;
        
        pendingOperationIds.push(operationId);
        
        emit OperationScheduled(operationId, target, data, executeAfter);
        emit OperationConfirmed(operationId, msg.sender);
        
        return operationId;
    }
    
    /// @notice Confirm a pending operation
    /// @param operationId ID of the operation to confirm
    function confirmOperation(bytes32 operationId) external onlyAuthorizedSigner {
        PendingOperation storage operation = pendingOperations[operationId];
        require(operation.executeAfter > 0, "Operation does not exist");
        require(!operation.executed, "Operation already executed");
        require(!operation.confirmed[msg.sender], "Already confirmed by this signer");
        
        operation.confirmed[msg.sender] = true;
        operation.confirmations++;
        
        emit OperationConfirmed(operationId, msg.sender);
    }
    
    /// @notice Execute a confirmed operation after timelock period
    /// @param operationId ID of the operation to execute
    function executeOperation(bytes32 operationId) external nonReentrant {
        PendingOperation storage operation = pendingOperations[operationId];
        require(operation.executeAfter > 0, "Operation does not exist");
        require(!operation.executed, "Operation already executed");
        require(block.timestamp >= operation.executeAfter, "Timelock period not passed");
        require(operation.confirmations >= requiredSignatures, "Not enough confirmations");
        
        operation.executed = true;
        
        // Execute the operation
        (bool success, ) = operation.target.call(operation.data);
        require(success, "Operation execution failed");
        
        emit OperationExecuted(operationId, operation.target, operation.data);
    }
    
    /// @notice Cancel a pending operation
    /// @param operationId ID of the operation to cancel
    function cancelOperation(bytes32 operationId) external onlyOwner {
        PendingOperation storage operation = pendingOperations[operationId];
        require(operation.executeAfter > 0, "Operation does not exist");
        require(!operation.executed, "Operation already executed");
        
        delete pendingOperations[operationId];
        
        // Remove from pending operations array
        for (uint256 i = 0; i < pendingOperationIds.length; i++) {
            if (pendingOperationIds[i] == operationId) {
                pendingOperationIds[i] = pendingOperationIds[pendingOperationIds.length - 1];
                pendingOperationIds.pop();
                break;
            }
        }
        
        emit OperationCancelled(operationId);
    }
    
    /// @notice Add a new authorized signer
    /// @param newSigner Address of the new signer
    function addSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Invalid signer address");
        require(!isAuthorizedSigner[newSigner], "Signer already authorized");
        
        isAuthorizedSigner[newSigner] = true;
        authorizedSigners.push(newSigner);
        totalSigners++;
        
        emit SignerAdded(newSigner);
    }
    
    /// @notice Remove an authorized signer
    /// @param signer Address of the signer to remove
    function removeSigner(address signer) external onlyOwner {
        require(isAuthorizedSigner[signer], "Signer not authorized");
        require(totalSigners > requiredSignatures, "Cannot remove signer: would fall below required signatures");
        
        isAuthorizedSigner[signer] = false;
        totalSigners--;
        
        // Remove from signers array
        for (uint256 i = 0; i < authorizedSigners.length; i++) {
            if (authorizedSigners[i] == signer) {
                authorizedSigners[i] = authorizedSigners[authorizedSigners.length - 1];
                authorizedSigners.pop();
                break;
            }
        }
        
        emit SignerRemoved(signer);
    }
    
    /// @notice Update required number of signatures
    /// @param newRequired New number of required signatures
    function updateRequiredSignatures(uint256 newRequired) external onlyOwner {
        require(newRequired > 0, "Required signatures must be > 0");
        require(newRequired <= totalSigners, "Required signatures cannot exceed total signers");
        
        uint256 oldRequired = requiredSignatures;
        requiredSignatures = newRequired;
        
        emit RequiredSignaturesUpdated(oldRequired, newRequired);
    }
    
    /// @notice Update timelock delay
    /// @param newDelay New timelock delay
    function updateTimelockDelay(uint256 newDelay) external onlyOwner {
        require(newDelay >= MIN_DELAY && newDelay <= MAX_DELAY, "Invalid timelock delay");
        
        uint256 oldDelay = timelockDelay;
        timelockDelay = newDelay;
        
        emit TimelockDelayUpdated(oldDelay, newDelay);
    }
    
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
    ) {
        PendingOperation storage operation = pendingOperations[operationId];
        return (
            operation.target,
            operation.data,
            operation.executeAfter,
            operation.executed,
            operation.confirmations
        );
    }
    
    /// @notice Check if a signer has confirmed an operation
    /// @param operationId ID of the operation
    /// @param signer Address of the signer
    /// @return Whether the signer has confirmed the operation
    function hasConfirmed(bytes32 operationId, address signer) external view returns (bool) {
        return pendingOperations[operationId].confirmed[signer];
    }
    
    /// @notice Get all authorized signers
    /// @return Array of authorized signer addresses
    function getAuthorizedSigners() external view returns (address[] memory) {
        return authorizedSigners;
    }
    
    /// @notice Get all pending operation IDs
    /// @return Array of pending operation IDs
    function getPendingOperations() external view returns (bytes32[] memory) {
        return pendingOperationIds;
    }
    
    /// @notice Get number of pending operations
    /// @return Number of pending operations
    function getPendingOperationsCount() external view returns (uint256) {
        return pendingOperationIds.length;
    }
}