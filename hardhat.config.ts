import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "hardhat-contract-sizer";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true, // 启用优化以减少字节码大小
        runs: 200, // 尝试 200 或 1000
      },
      outputSelection: {
        "*": {
          "*": ["evm.bytecode"],
        },
      },
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      chainId: 31337,
      gas: "auto",
      gasPrice: "auto",
      accounts: {
        count: 10,
      },
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [process.env.SEPOLIA_PRIVATE_KEY!],
      gas: "auto",
      gasPrice: "auto",
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  mocha: {
    timeout: 100000,
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    unit: "KiB",
    except: [],
  },
};

// console.log("Hardhat config loaded:", config.networks);

export default config;