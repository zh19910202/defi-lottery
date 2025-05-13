# DeFi彩票系统部署指南

本文档提供了DeFi彩票系统的部署和初始化指南。系统包含多个智能合约，它们需要按照特定顺序部署并正确配置才能正常工作。

## 合约架构

系统由以下主要合约组成：

1. **WETH9** - 包装以太币合约，用于在系统中使用ETH
2. **VaultShareToken** - 代表用户在金库中份额的ERC20代币
3. **Lottery** - 处理彩票抽奖逻辑和随机数生成
4. **PrizePool** - 管理奖金池和奖励分配
5. **Vault** - 管理用户存款和提款
6. **YieldAggregator** - 与外部DeFi协议（如Compound）交互以产生收益
7. **LotteryRouter** - 中央路由合约，协调各合约之间的交互

## 部署步骤

### 1. 准备环境

确保已安装所需依赖：

```bash
yarn install
```

### 2. 配置网络

在`hardhat.config.ts`中配置目标网络。例如，添加测试网或主网配置：

```typescript
networks: {
  goerli: {
    url: `https://goerli.infura.io/v3/${INFURA_API_KEY}`,
    accounts: [PRIVATE_KEY]
  },
  // 其他网络...
}
```

### 3. 部署合约

#### 3.1 使用单一部署脚本（旧方式）

运行单一部署脚本：

```bash
npx hardhat run scripts/deploy-contracts.js --network <network_name>
```

#### 3.2 使用模块化部署脚本（推荐）

我们提供了模块化的部署脚本，每个合约一个脚本，可以单独部署或一次性部署所有合约。

##### 部署所有合约

```bash
npx hardhat run scripts/deploy/deploy-all.js --network <network_name>
```

##### 单独部署特定合约

```bash
# 部署WETH9
npx hardhat run scripts/deploy/01-deploy-weth.js --network <network_name>

# 部署VaultShareToken
npx hardhat run scripts/deploy/02-deploy-vault-share-token.js --network <network_name>

# 其他合约类似
```

部署顺序：

1. WETH9
2. VaultShareToken
3. Lottery
4. PrizePool
5. Vault
6. YieldAggregator
7. LotteryRouter

部署信息将保存在`deployments/<network_name>.json`文件中。

更多详细信息请参考 `scripts/deploy/README.md`。

### 4. 初始化合约

部署完成后，运行初始化脚本设置合约之间的关联：

```bash
npx hardhat run scripts/initialize-contracts.js --network <network_name>
```

此脚本将：

1. 初始化VaultShareToken
2. 配置LotteryRouter的组件引用
3. 设置Lottery的组件引用
4. 设置PrizePool的组件引用
5. 设置Vault的组件引用
6. 设置必要的授权

### 5. 验证部署配置

初始化完成后，运行验证脚本确认所有合约配置正确：

```bash
npx hardhat run scripts/verify-deployment.js --network <network_name>
```

此脚本将检查：

1. 所有合约之间的引用关系是否正确设置
2. 各组件的地址配置是否与部署信息一致
3. 输出详细的验证结果，帮助识别潜在问题

## 自定义配置

如需自定义部署参数，请修改`deploy-contracts.js`中的以下变量：

- `vrfCoordinator` - Chainlink VRF协调器地址
- `keyHash` - Chainlink VRF密钥哈希
- `subscriptionId` - Chainlink VRF订阅ID
- `cometAddress` - Compound的Comet合约地址
- `feeRate` - 奖金提取费率（基点，1% = 100）
- `drawPeriod` - 抽奖周期（秒）

## 验证合约

部署后，可以使用以下命令验证合约：

```bash
npx hardhat verify --network <network_name> <contract_address> <constructor_arguments>
```

## 故障排除

- 如果初始化脚本失败，请检查部署信息文件是否存在
- 确保使用的账户有足够的ETH支付gas费
- 检查合约地址是否正确配置

## 安全注意事项

- 生产环境部署前，确保所有合约已经过全面审计
- 使用多签钱包作为合约所有者
- 部署后验证所有合约的权限设置是否正确
