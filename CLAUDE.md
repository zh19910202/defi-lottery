# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeFi Lottery is a decentralized lottery system built on Ethereum that combines DeFi yield generation with random prize draws. Users deposit WETH tokens to participate in periodic lotteries while their funds generate yield through DeFi protocols like Compound. Only winners receive the generated yield, while other users can withdraw their original principal.

## Core Architecture

The system consists of 5 main contracts with clear separation of concerns:

### 1. Vault Contract (`contracts/Vault.sol`)
- Manages user deposits and withdrawals
- Mints/burns VaultShareTokens representing user stakes
- Calculates user lucky value weights for lottery participation
- Interacts with YieldAggregator to invest funds in DeFi protocols
- Enforces deposit limits: 0.1-1 ETH per user

### 2. Lottery Contract (`contracts/Lottery.sol`) 
- Manages lottery rounds and timing (30-day cycles)
- Uses Chainlink VRF for verifiable random number generation
- Implements SortitionSumTree for weighted user selection
- Determines winners based on user weights and random numbers
- Coordinates with PrizePool for prize distribution

### 3. PrizePool Contract (`contracts/PrizePool.sol`)
- Manages prize pool funds and payouts
- Collects yield from YieldAggregator
- Distributes ~95% of yield to winners, reinvests 5% as system fees
- Tracks prize history and balances

### 4. LotteryRouter Contract (`contracts/LotteryRouter.sol`)
- Unified user interface for all lottery operations
- Coordinates calls between different contracts
- Simplifies user deposit/withdrawal flows
- Provides consolidated state queries

### 5. YieldAggregator Contract (`contracts/YieldAggregator.sol`)
- Interfaces with Compound protocol for yield generation
- Manages WETH deposits and withdrawals to/from Compound
- Optimizes yield strategies
- Provides balance tracking for the system

## Key Technical Details

- **Solidity Version**: 0.8.28 with optimizer enabled (200 runs)
- **Token Standard**: Uses WETH (Wrapped Ethereum) instead of native ETH
- **Random Number Generation**: Chainlink VRF v2 for provable randomness
- **Weight Calculation**: LuckyValueCalculator determines user weights based on deposit amount and duration
- **Data Structure**: SortitionSumTree for efficient weighted random selection
- **Security**: ReentrancyGuard, access controls, and proper event logging

## Development Commands

### Build and Compilation
```bash
npm run compile          # Compile all contracts
npm run clean           # Clean compiled artifacts
npm run typechain       # Generate TypeScript types
```

### Testing
```bash
npm test               # Run all tests
npm run test:coverage  # Run tests with coverage report
npm run test:gas       # Run tests with gas reporting
```

### Code Quality
```bash
npm run lint           # Format contracts and tests with Prettier
npm run lint:check     # Check code formatting without fixing
```

### Local Development
```bash
npm run node           # Start local Hardhat network
npm run accounts       # Show available test accounts
```

### Deployment
```bash
npm run deploy:local    # Deploy to local Hardhat network
npm run deploy:testnet  # Deploy to Sepolia testnet
npm run deploy:mainnet  # Deploy to Ethereum mainnet
npm run verify         # Verify contracts on Etherscan
```

## Testing Structure

Test files are organized by contract:
- `test/Vault.test.ts` - Vault deposit/withdrawal functionality
- `test/Lottery.test.ts` - Core lottery mechanics
- `test/LotteryFactory.test.ts` - Factory pattern tests
- `test/PrizePool.test.ts` - Prize distribution logic
- `test/YieldAggregator.test.ts` - Yield generation integration
- `test/utils/setup.ts` - Common test utilities and fixtures

## Key Configuration Files

- `hardhat.config.ts` - Hardhat configuration with Sepolia testnet setup
- `package.json` - Dependencies and build scripts
- `tsconfig.json` - TypeScript configuration for tests
- `contracts/artifacts/` - Compiled contract artifacts and metadata

## Important Design Patterns

- **Proxy Pattern**: Contracts designed for upgradeability
- **Factory Pattern**: LotteryFactory for creating lottery instances
- **Interface Segregation**: Clear interfaces for all major contracts
- **Access Control**: Owner-only functions with proper modifiers
- **Event-Driven**: Comprehensive event logging for all major operations

## Security Considerations

- All user funds are held in smart contracts, not by trusted parties
- Withdrawal only returns original principal, not accrued yield
- Deposit limits prevent whale manipulation
- VRF ensures verifiable randomness in winner selection
- Non-reentrant modifiers protect against reentrancy attacks