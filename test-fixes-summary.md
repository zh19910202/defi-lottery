# 测试修复总结

## 修复的问题

1. **多重MockERC20和MockComet合约实现**

   - **问题**: 项目中存在多个相同名称的模拟合约实现（在`contracts/test`和`contracts/mocks`目录下），导致合约工厂创建时出现歧义。
   - **解决方法**: 使用全限定名称引用合约，例如`contracts/test/MockERC20.sol:MockERC20`。

2. **Ethers.js API版本差异**

   - **问题**: 代码使用了较旧版本Ethers.js的`deployed()`方法，而当前项目使用的是新版本。
   - **解决方法**: 将`await contract.deployed()`替换为`await contract.waitForDeployment()`，将`deployTransaction.wait()`替换为`waitForDeployment()`。

3. **TypeScript类型问题**

   - **问题**: 在测试工具类中，合约类型与实际生成的typechain类型不匹配。
   - **解决方法**: 暂时使用通用`Contract`类型，后续需要更新以匹配正确的类型定义。

4. **合约地址获取方式**
   - **问题**: 从v5升级到v6后，`contract.address`变更为`await contract.getAddress()`。
   - **解决方法**: 所有合约地址获取更新为使用`getAddress()`方法。

## 验证的功能

1. **LotteryFactory部署**

   - 创建了简单测试验证工厂合约本身可以正确部署。

2. **单个组件部署**
   - 验证了`Vault`、`Lottery`和`Router`组件可以单独成功部署。
   - 通过事件获取组件地址，而非通过工厂合约状态变量。

## 尚待解决的问题

1. **全系统部署的所有权问题**

   - **问题**: 在`deploySystem`函数中，尝试配置组件之间的关系时出现"Ownable: caller is not the owner"错误。
   - **原因分析**:
     - 在`deployVault`方法中使用了`initialize`模式并转移了所有权到`msg.sender`。
     - 但在`deploySystem`中，工厂合约尝试调用需要所有者权限的方法，如`setRouter`。
   - **可能解决方向**:
     - 修改`deployVault`方法以保留工厂合约的所有权直到系统配置完成。
     - 或在`deploySystem`内重新设置所有权后再进行配置。

2. **内存溢出和gas限制**
   - 在LotteryFactory.sol的错误提示中暗示合约大小已超过24576字节。
   - 如果部署到以太坊主网，可能需要进行合约拆分或优化。

## 建议后续步骤

1. 修复`deploySystem`方法中的所有权问题。
2. 完善测试用例以验证完整系统的部署和交互。
3. 解决TypeScript类型问题，确保类型安全。
4. 考虑合约大小优化以便于主网部署。
5. 使用哈德哈特配置中的`allowUnlimitedContractSize: true`选项以允许本地测试超大合约。
