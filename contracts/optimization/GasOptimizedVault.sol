// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Gas Optimized Vault Contract
/// @notice Demonstrates gas optimization techniques for vault operations
/// @dev This is a conceptual contract showing optimization patterns
contract GasOptimizedVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /// @notice Packed struct for user deposits to save storage slots
    struct PackedDeposit {
        uint128 amount;      // 16 bytes
        uint32 timestamp;    // 4 bytes  
        uint96 weight;       // 12 bytes
        // Total: 32 bytes = 1 storage slot
    }
    
    /// @notice Packed struct for round data
    struct PackedDepositRound {
        uint128 totalDeposits;  // 16 bytes
        uint128 totalWeight;    // 16 bytes
        // Total: 32 bytes = 1 storage slot
        
        uint64 drawTimestamp;   // 8 bytes
        bool isActive;          // 1 byte
        // Remaining 23 bytes available for future use
    }
    
    /// @notice Token contract
    IERC20 public token;
    
    /// @notice Minimum and maximum deposit amounts
    uint256 public constant MIN_DEPOSIT = 0.1 ether;
    uint256 public constant MAX_DEPOSIT = 1 ether;
    
    /// @notice Current round ID
    uint256 public currentRoundId;
    
    /// @notice Total deposits across all rounds
    uint256 public totalDeposits;
    
    /// @notice Optimized mapping for packed deposits
    mapping(uint256 => mapping(address => PackedDeposit)) private _packedDeposits;
    
    /// @notice Optimized mapping for packed rounds
    mapping(uint256 => PackedDepositRound) private _packedRounds;
    
    /// @notice Bitmap for tracking participation to save gas
    mapping(uint256 => mapping(address => bool)) private _participationBitmap;
    
    /// @notice Array of participants for each round
    mapping(uint256 => address[]) public participants;
    
    /// @notice Events optimized for gas efficiency
    event OptimizedDeposited(address indexed user, uint128 amount, uint32 timestamp, uint256 indexed roundId);
    event OptimizedWithdrawn(address indexed user, uint128 amount, uint32 timestamp, uint256 indexed roundId);
    
    constructor(address _token) {
        require(_token != address(0), "Invalid token address");
        token = IERC20(_token);
        currentRoundId = 0;
        
        // Initialize first round
        _packedRounds[0].isActive = true;
        _packedRounds[0].drawTimestamp = uint64(block.timestamp + 30 days);
    }
    
    /// @notice Gas-optimized deposit function
    /// @param amount Amount to deposit
    function optimizedDeposit(uint256 amount) external nonReentrant {
        require(amount >= MIN_DEPOSIT && amount <= MAX_DEPOSIT, "Invalid amount");
        require(amount <= type(uint128).max, "Amount too large");
        
        // Use assembly for gas optimization
        assembly {
            // Check if user already has a deposit (gas optimization)
            let userDepositSlot := keccak256(add(add(_packedDeposits.slot, mul(sload(currentRoundId.slot), 0x20)), caller()), 0x40)
            let existingAmount := and(sload(userDepositSlot), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            
            if gt(existingAmount, 0) {
                // Revert if user already has deposit
                mstore(0x00, 0x08c379a000000000000000000000000000000000000000000000000000000000)
                mstore(0x04, 0x0000002000000000000000000000000000000000000000000000000000000000)
                mstore(0x24, 0x0000001255736572206861732065786973746564206465706f73697400000000)
                revert(0x00, 0x44)
            }
        }
        
        // Transfer tokens
        token.safeTransferFrom(msg.sender, address(this), amount);
        
        // Calculate simple weight (for demonstration)
        uint256 weight = amount * 1000; // Simple weight calculation
        
        // Ensure weight fits in uint96
        if (weight > type(uint96).max) {
            weight = type(uint96).max;
        }
        
        // Pack and store deposit data
        PackedDeposit memory deposit = PackedDeposit({
            amount: uint128(amount),
            timestamp: uint32(block.timestamp),
            weight: uint96(weight)
        });
        
        _packedDeposits[currentRoundId][msg.sender] = deposit;
        _participationBitmap[currentRoundId][msg.sender] = true;
        
        // Update round totals
        PackedDepositRound storage round = _packedRounds[currentRoundId];
        round.totalDeposits += uint128(amount);
        round.totalWeight += uint128(weight);
        
        // Update global total
        totalDeposits += amount;
        
        // Add to participants array
        participants[currentRoundId].push(msg.sender);
        
        emit OptimizedDeposited(msg.sender, uint128(amount), uint32(block.timestamp), currentRoundId);
    }
    
    /// @notice Gas-optimized withdrawal function
    function optimizedWithdraw() external nonReentrant {
        _optimizedWithdrawFromRound(msg.sender, currentRoundId);
    }
    
    /// @notice Internal optimized withdrawal logic
    /// @param user User address
    /// @param roundId Round ID
    function _optimizedWithdrawFromRound(address user, uint256 roundId) internal {
        PackedDeposit storage userDeposit = _packedDeposits[roundId][user];
        require(userDeposit.amount > 0, "No deposit");
        
        uint256 withdrawAmount = userDeposit.amount;
        uint256 userWeight = userDeposit.weight;
        
        // Clear user data (gas optimized)
        delete _packedDeposits[roundId][user];
        _participationBitmap[roundId][user] = false;
        
        // Update round totals
        PackedDepositRound storage round = _packedRounds[roundId];
        round.totalDeposits -= uint128(withdrawAmount);
        round.totalWeight -= uint128(userWeight);
        
        // Update global total
        totalDeposits -= withdrawAmount;
        
        // Transfer tokens to user
        token.safeTransfer(user, withdrawAmount);
        
        emit OptimizedWithdrawn(user, uint128(withdrawAmount), uint32(block.timestamp), roundId);
    }
    
    /// @notice Batch deposit for multiple users (gas efficient)
    /// @param users Array of user addresses
    /// @param amounts Array of deposit amounts
    function batchDeposit(address[] calldata users, uint256[] calldata amounts) external nonReentrant {
        require(users.length == amounts.length, "Array length mismatch");
        require(users.length <= 50, "Too many users"); // Prevent gas limit issues
        
        uint256 totalAmount = 0;
        uint256 totalWeight = 0;
        
        // Pre-calculate total for single approval
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] >= MIN_DEPOSIT && amounts[i] <= MAX_DEPOSIT, "Invalid amount");
            totalAmount += amounts[i];
        }
        
        // Single token transfer for all deposits
        token.safeTransferFrom(msg.sender, address(this), totalAmount);
        
        // Process each deposit
        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            uint256 amount = amounts[i];
            
            // Calculate weight
            uint256 weight = amount * 1000; // Simple weight calculation
            
            if (weight > type(uint96).max) {
                weight = type(uint96).max;
            }
            
            // Store deposit
            _packedDeposits[currentRoundId][user] = PackedDeposit({
                amount: uint128(amount),
                timestamp: uint32(block.timestamp),
                weight: uint96(weight)
            });
            
            _participationBitmap[currentRoundId][user] = true;
            totalWeight += weight;
            
            // Add to participants
            participants[currentRoundId].push(user);
            
            emit OptimizedDeposited(user, uint128(amount), uint32(block.timestamp), currentRoundId);
        }
        
        // Update totals once
        PackedDepositRound storage round = _packedRounds[currentRoundId];
        round.totalDeposits += uint128(totalAmount);
        round.totalWeight += uint128(totalWeight);
        totalDeposits += totalAmount;
    }
    
    /// @notice Get optimized user deposit info
    /// @param user User address
    /// @param roundId Round ID
    /// @return amount Deposit amount
    /// @return timestamp Deposit timestamp
    /// @return weight User weight
    function getOptimizedUserDeposit(address user, uint256 roundId) external view returns (
        uint128 amount,
        uint32 timestamp,
        uint96 weight
    ) {
        PackedDeposit storage deposit = _packedDeposits[roundId][user];
        return (deposit.amount, deposit.timestamp, deposit.weight);
    }
    
    /// @notice Get optimized round info
    /// @param roundId Round ID
    /// @return roundTotalDeposits Total deposits in round
    /// @return totalWeight Total weight in round
    /// @return drawTimestamp Draw timestamp
    /// @return isActive Whether round is active
    function getOptimizedRoundInfo(uint256 roundId) external view returns (
        uint128 roundTotalDeposits,
        uint128 totalWeight,
        uint64 drawTimestamp,
        bool isActive
    ) {
        PackedDepositRound storage round = _packedRounds[roundId];
        return (round.totalDeposits, round.totalWeight, round.drawTimestamp, round.isActive);
    }
    
    /// @notice Check if user participated in round (gas efficient)
    /// @param user User address
    /// @param roundId Round ID
    /// @return Whether user participated
    function hasParticipatedOptimized(address user, uint256 roundId) external view returns (bool) {
        return _participationBitmap[roundId][user];
    }
    
    /// @notice Get number of participants in a round
    /// @param roundId Round ID
    /// @return Number of participants
    function getParticipantCount(uint256 roundId) external view returns (uint256) {
        return participants[roundId].length;
    }
    
    /// @notice Start new round (owner only)
    function startNewRound() external onlyOwner {
        // End current round
        _packedRounds[currentRoundId].isActive = false;
        
        // Start new round
        currentRoundId++;
        _packedRounds[currentRoundId].isActive = true;
        _packedRounds[currentRoundId].drawTimestamp = uint64(block.timestamp + 30 days);
    }
}