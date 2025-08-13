// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Emergency Pause Contract
/// @notice Provides emergency pause functionality for critical operations
/// @dev Extends OpenZeppelin's Pausable with additional emergency features
contract EmergencyPause is Pausable, Ownable {
    /// @notice Emergency pause guardian address
    address public emergencyGuardian;
    
    /// @notice Timestamp when emergency pause was activated
    uint256 public emergencyPauseTimestamp;
    
    /// @notice Maximum duration for emergency pause (7 days)
    uint256 public constant MAX_EMERGENCY_PAUSE_DURATION = 7 days;
    
    /// @notice Mapping of function selectors to their pause status
    mapping(bytes4 => bool) public functionPaused;
    
    /// @notice Events
    event EmergencyGuardianSet(address indexed oldGuardian, address indexed newGuardian);
    event EmergencyPauseActivated(address indexed activator, uint256 timestamp);
    event EmergencyPauseDeactivated(address indexed deactivator, uint256 timestamp);
    event FunctionPauseToggled(bytes4 indexed functionSelector, bool paused);
    
    /// @notice Constructor
    /// @param _emergencyGuardian Address of the emergency guardian
    constructor(address _emergencyGuardian) {
        require(_emergencyGuardian != address(0), "Invalid guardian address");
        emergencyGuardian = _emergencyGuardian;
    }
    
    /// @notice Modifier to check if caller is owner or emergency guardian
    modifier onlyOwnerOrGuardian() {
        require(
            msg.sender == owner() || msg.sender == emergencyGuardian,
            "Not authorized for emergency actions"
        );
        _;
    }
    
    /// @notice Modifier to check if a specific function is not paused
    /// @param functionSelector The function selector to check
    modifier whenFunctionNotPaused(bytes4 functionSelector) {
        require(!functionPaused[functionSelector], "Function is paused");
        _;
    }
    
    /// @notice Set emergency guardian address
    /// @param _newGuardian New guardian address
    function setEmergencyGuardian(address _newGuardian) external onlyOwner {
        require(_newGuardian != address(0), "Invalid guardian address");
        address oldGuardian = emergencyGuardian;
        emergencyGuardian = _newGuardian;
        emit EmergencyGuardianSet(oldGuardian, _newGuardian);
    }
    
    /// @notice Activate emergency pause
    /// @dev Can be called by owner or emergency guardian
    function emergencyPause() external onlyOwnerOrGuardian {
        require(!paused(), "Already paused");
        emergencyPauseTimestamp = block.timestamp;
        _pause();
        emit EmergencyPauseActivated(msg.sender, block.timestamp);
    }
    
    /// @notice Deactivate emergency pause
    /// @dev Can be called by owner or emergency guardian
    function emergencyUnpause() external onlyOwnerOrGuardian {
        require(paused(), "Not paused");
        emergencyPauseTimestamp = 0;
        _unpause();
        emit EmergencyPauseDeactivated(msg.sender, block.timestamp);
    }
    
    /// @notice Auto-unpause after maximum duration
    /// @dev Anyone can call this after the maximum pause duration
    function autoUnpause() external {
        require(paused(), "Not paused");
        require(emergencyPauseTimestamp > 0, "No emergency pause timestamp");
        require(
            block.timestamp >= emergencyPauseTimestamp + MAX_EMERGENCY_PAUSE_DURATION,
            "Emergency pause duration not exceeded"
        );
        
        emergencyPauseTimestamp = 0;
        _unpause();
        emit EmergencyPauseDeactivated(msg.sender, block.timestamp);
    }
    
    /// @notice Pause/unpause a specific function
    /// @param functionSelector The function selector to pause/unpause
    /// @param _paused Whether to pause or unpause the function
    function toggleFunctionPause(bytes4 functionSelector, bool _paused) external onlyOwner {
        functionPaused[functionSelector] = _paused;
        emit FunctionPauseToggled(functionSelector, _paused);
    }
    
    /// @notice Check if emergency pause is active and within time limit
    /// @return Whether emergency pause is active and valid
    function isEmergencyPauseActive() external view returns (bool) {
        if (!paused() || emergencyPauseTimestamp == 0) {
            return false;
        }
        
        return block.timestamp < emergencyPauseTimestamp + MAX_EMERGENCY_PAUSE_DURATION;
    }
    
    /// @notice Get remaining emergency pause time
    /// @return Remaining time in seconds, 0 if not paused or expired
    function getRemainingPauseTime() external view returns (uint256) {
        if (!paused() || emergencyPauseTimestamp == 0) {
            return 0;
        }
        
        uint256 endTime = emergencyPauseTimestamp + MAX_EMERGENCY_PAUSE_DURATION;
        if (block.timestamp >= endTime) {
            return 0;
        }
        
        return endTime - block.timestamp;
    }
}