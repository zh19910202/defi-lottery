module.exports = (network) => {
  const configs = {
    sepolia: {
      comet: '0x2943ac1216979aD8dB76D9147F64E61adc126e96',
      weth: '0x2D5ee574e710219a521449679A4A7f2B43f046ad',
      vrfCoordinator: '0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625',
      keyHash: '0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c',
      subscriptionId: '40473456374115908599636799878167985685965739996061897743825189284911781192841',
      enableNativePayment: false
    },
    mainnet: {
      // 主网配置示例
    },
    hardhat: {
      comet: '0x2943ac1216979aD8dB76D9147F64E61adc126e96',
      weth: '0x2D5ee574e710219a521449679A4A7f2B43f046ad',
      vrfCoordinator: '0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B',
      keyHash: '0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae',
      subscriptionId: '40473456374115908599636799878167985685965739996061897743825189284911781192841',
      enableNativePayment: true
    }
  }

  if (!configs[network]) throw new Error(`未找到 ${network} 网络配置`)
  return configs[network]
}