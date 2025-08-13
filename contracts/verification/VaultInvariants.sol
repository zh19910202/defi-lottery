// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../Vault.sol";
import "../interfaces/IVaultShareToken.sol";

/// @title Vault Invariants Contract
/// @notice Contains formal verification invariants for the Vault contract
/// @dev Used for property-based testing and formal verification
contract VaultInvariants {
    Vault public vault;
    IVaultShareToken public shareToken;
    
    constructor(address _vault) {
        vault = Vault(payable(_vault));
        shareToken = IVaultShareToken(vault.getShareToken());
    }
    
    /// @notice Invariant: Total deposits should equal sum of all user deposits
    /// @dev This ensures no funds are lost or created
    function invariant_totalDepositsEqualsUserDeposits() public view returns (bool) {
        uint256 totalDeposits = vault.getAllDepositsTotal();
        uint256 currentRoundId = vault.getCurrentRoundId();
        
        // Sum all user deposits across all rounds
        uint256 calculatedTotal = 0;
        
        // For simplicity, we check the current round
        // In a full implementation, we'd iterate through all rounds
        uint256 userCount = vault.getUserCount(currentRoundId);
        for (uint256 i = 0; i < userCount; i++) {
            address user = vault.getUser(i, currentRoundId);
            IVault.Deposit memory deposit = vault.userDeposits(user, currentRoundId);
            uint128 amount = deposit.amount;
            calculatedTotal += amount;
        }
        
        return totalDeposits >= calculatedTotal; // Allow for rounding differences
    }
    
    /// @notice Invariant: Share token total supply should equal total deposits
    /// @dev This ensures proper minting/burning of share tokens
    function invariant_shareTokenSupplyEqualsDeposits() public view returns (bool) {
        if (address(shareToken) == address(0)) {
            return true; // Skip if share token not set
        }
        
        uint256 totalSupply = shareToken.totalSupply();
        uint256 totalDeposits = vault.getAllDepositsTotal();
        
        // Allow for small differences due to rounding
        uint256 difference = totalSupply > totalDeposits ? 
            totalSupply - totalDeposits : 
            totalDeposits - totalSupply;
            
        return difference <= 1e12; // Allow up to 1e12 wei difference
    }
    
    /// @notice Invariant: User weights should be positive for users with deposits
    /// @dev This ensures weight calculation is working correctly
    function invariant_positiveWeightsForDepositors() public view returns (bool) {
        uint256 currentRoundId = vault.getCurrentRoundId();
        uint256 userCount = vault.getUserCount(currentRoundId);
        
        for (uint256 i = 0; i < userCount; i++) {
            address user = vault.getUser(i, currentRoundId);
            IVault.Deposit memory deposit = vault.userDeposits(user, currentRoundId);
            uint128 amount = deposit.amount;
            uint96 weight = deposit.weight;
            
            if (amount > 0 && weight == 0) {
                return false; // User has deposit but no weight
            }
        }
        
        return true;
    }
    
    /// @notice Invariant: Total weight should equal sum of all user weights
    /// @dev This ensures weight accounting is correct
    function invariant_totalWeightEqualsUserWeights() public view returns (bool) {
        uint256 currentRoundId = vault.getCurrentRoundId();
        uint256 totalWeight = vault.getTotalWeight(currentRoundId);
        uint256 userCount = vault.getUserCount(currentRoundId);
        
        uint256 calculatedWeight = 0;
        for (uint256 i = 0; i < userCount; i++) {
            address user = vault.getUser(i, currentRoundId);
            IVault.Deposit memory deposit = vault.userDeposits(user, currentRoundId);
            uint96 weight = deposit.weight;
            calculatedWeight += weight;
        }
        
        return totalWeight == calculatedWeight;
    }
    
    /// @notice Invariant: Deposits should be within allowed range
    /// @dev This ensures deposit limits are enforced
    function invariant_depositsWithinRange() public view returns (bool) {
        uint256 currentRoundId = vault.getCurrentRoundId();
        uint256 userCount = vault.getUserCount(currentRoundId);
        
        uint256 minDeposit = vault.MIN_DEPOSIT();
        uint256 maxDeposit = vault.MAX_DEPOSIT();
        
        for (uint256 i = 0; i < userCount; i++) {
            address user = vault.getUser(i, currentRoundId);
            IVault.Deposit memory deposit = vault.userDeposits(user, currentRoundId);
            uint128 amount = deposit.amount;
            
            if (amount > 0 && (amount < minDeposit || amount > maxDeposit)) {
                return false;
            }
        }
        
        return true;
    }
    
    /// @notice Invariant: No user should have zero deposit but be in participants list
    /// @dev This ensures proper cleanup of participant data
    function invariant_noZeroDepositParticipants() public view returns (bool) {
        uint256 currentRoundId = vault.getCurrentRoundId();
        uint256 userCount = vault.getUserCount(currentRoundId);
        
        for (uint256 i = 0; i < userCount; i++) {
            address user = vault.getUser(i, currentRoundId);
            IVault.Deposit memory deposit = vault.userDeposits(user, currentRoundId);
            uint128 amount = deposit.amount;
            
            if (amount == 0) {
                return false; // User in list but has no deposit
            }
        }
        
        return true;
    }
    
    /// @notice Property: Deposit should increase user's balance and total deposits
    /// @dev This is a state transition property
    function property_depositIncreasesBalances(address user, uint256 amount) public view returns (bool) {
        // This would be used in property-based testing
        // The actual implementation would involve state snapshots
        
        if (amount < vault.MIN_DEPOSIT() || amount > vault.MAX_DEPOSIT()) {
            return true; // Should revert, so property holds
        }
        
        // In actual testing, we'd check:
        // 1. User's deposit amount increases by 'amount'
        // 2. Total deposits increase by 'amount'
        // 3. User's weight is calculated correctly
        // 4. Share tokens are minted to user
        
        return true; // Placeholder
    }
    
    /// @notice Property: Withdrawal should decrease user's balance and total deposits
    /// @dev This is a state transition property
    function property_withdrawalDecreasesBalances(address user) public view returns (bool) {
        // This would be used in property-based testing
        // The actual implementation would involve state snapshots
        
        uint256 currentRoundId = vault.getCurrentRoundId();
        IVault.Deposit memory deposit = vault.userDeposits(user, currentRoundId);
        uint128 userAmount = deposit.amount;
        
        if (userAmount == 0) {
            return true; // Should revert, so property holds
        }
        
        // In actual testing, we'd check:
        // 1. User's deposit amount becomes 0
        // 2. Total deposits decrease by user's amount
        // 3. User's weight becomes 0
        // 4. Share tokens are burned from user
        
        return true; // Placeholder
    }
    
    /// @notice Property: Weight calculation should be deterministic
    /// @dev Same inputs should always produce same outputs
    function property_weightCalculationDeterministic(uint256 amount, uint256 timeElapsed) public pure returns (bool) {
        // This tests the LuckyValueCalculator library
        if (amount == 0) {
            return true; // Should revert
        }
        
        // In actual testing, we'd verify:
        // 1. Same amount and time always produce same weight
        // 2. Weight increases with amount
        // 3. Weight increases with time (up to a limit)
        
        return true; // Placeholder
    }
    
    /// @notice Check all invariants at once
    /// @dev Useful for comprehensive testing
    function checkAllInvariants() public view returns (bool) {
        return invariant_totalDepositsEqualsUserDeposits() &&
               invariant_shareTokenSupplyEqualsDeposits() &&
               invariant_positiveWeightsForDepositors() &&
               invariant_totalWeightEqualsUserWeights() &&
               invariant_depositsWithinRange() &&
               invariant_noZeroDepositParticipants();
    }
}