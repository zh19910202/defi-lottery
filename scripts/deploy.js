const { ethers, network } = require("hardhat")
const fs = require("fs")
const path = require("path")

// 保存部署信息到JSON文件
async function saveDeploymentInfo (deploymentInfo) {
  // 创建deployments目录（如果不存在）
  const deploymentsDir = path.join(__dirname, '../deployments')
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true })
  }

  // 按网络名称保存部署信息
  const filePath = path.join(deploymentsDir, `${network.name}.json`)

  // 如果文件已存在，读取并合并信息
  let existingData = {}
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, 'utf8')
    existingData = JSON.parse(fileContent)
  }

  // 合并新旧数据
  const updatedData = { ...existingData, ...deploymentInfo }

  // 写入文件
  fs.writeFileSync(
    filePath,
    JSON.stringify(updatedData, null, 2),
    'utf8'
  )

  console.log(`部署信息已保存到: ${filePath}`)
}



async function main () {

  // 加载网络配置
  const config = require('./deploy-config')(network.name)


  // 部署Lottery合约
  const Lottery = await ethers.getContractFactory("Lottery")
  const lottery = await Lottery.deploy(
    config.vrfCoordinator,
    config.subscriptionId,
    config.keyHash,
    config.enableNativePayment
  )
  await lottery.waitForDeployment()
  console.log(`Lottery deployed at: ${await lottery.getAddress()}`)

  // 部署VaultShareToken
  const VaultShareToken = await ethers.getContractFactory('VaultShareToken')
  const vaultShareToken = await VaultShareToken.deploy('Vault Share Token', 'VST')
  await vaultShareToken.waitForDeployment()


  // // 部署Vault合约
  const Vault = await ethers.getContractFactory("Vault")
  const vault = await Vault.deploy()
  await vault.waitForDeployment()
  console.log(`Vault deployed at: ${await vault.getAddress()}`)


  // 部署PrizePool合约
  const PrizePool = await ethers.getContractFactory("PrizePool")
  const rate = 500 // 5%
  const prizePool = await PrizePool.deploy(await vault.getAddress(), rate)
  await prizePool.waitForDeployment()
  console.log(`PrizePool deployed at: ${await prizePool.getAddress()}`)

  // 部署YieldAggregator
  const YieldAggregator = await ethers.getContractFactory('YieldAggregator')
  const aggregator = await YieldAggregator.deploy(
    config.weth,
    await vault.getAddress(),
    await prizePool.getAddress(),
    config.comet
  )
  await aggregator.waitForDeployment()
  console.log(`YieldAggregator deployed at: ${await aggregator.getAddress()}`)


  // 部署LotteryRouter合约
  const LotteryRouter = await ethers.getContractFactory("LotteryRouter")
  const lotteryRouter = await LotteryRouter.deploy()
  await lotteryRouter.waitForDeployment()
  console.log(`LotteryRouter deployed at: ${await lotteryRouter.getAddress()}`)

  //初始化lottery
  await lottery.setVault(await vault.getAddress())
  
  await lottery.setPrizePool(await prizePool.getAddress())
  


  // 初始化PrizePool
  await prizePool.setVault(await vault.getAddress())
  await prizePool.setYieldAggregator(await aggregator.getAddress())
  await prizePool.setWETH(config.weth)


  // 初始化Vault
  
  await vault.setLottery(await lottery.getAddress())
  
  await vault.setPrizePool(await prizePool.getAddress())
  
  await vault.setYieldAggregator(await aggregator.getAddress())
  
  await vault.setShareToken(await vaultShareToken.getAddress())
  
  await vault.setWETH(config.weth)
  
  // 初始化VaultShareToken
  await vaultShareToken.setVault(await vault.getAddress())
  
  // 初始化LotteryRouter
  await lotteryRouter.setLottery(await lottery.getAddress())
  
  await lotteryRouter.setPrizePool(await prizePool.getAddress())
  
  await lotteryRouter.setVault(await vault.getAddress())

  await lotteryRouter.setShareToken(await vaultShareToken.getAddress())
  
  

  // 保存部署信息
  const deploymentInfo = {
    network: network.name,
    timestamp: new Date().toISOString(),
    contracts: {
      Lottery: await lottery.getAddress(),
      VaultShareToken: await vaultShareToken.getAddress(),
      Vault: await vault.getAddress(),
      PrizePool: await prizePool.getAddress(),
      YieldAggregator: await aggregator.getAddress(),
      LotteryRouter: await lotteryRouter.getAddress()
    },
    constructorArgs: {
      Lottery: [
        config.vrfCoordinator,
        config.subscriptionId,
        config.keyHash,
        config.enableNativePayment
      ],
      VaultShareToken: ['Vault Share Token', 'VST'],
      Vault: [], // 无构造参数
      PrizePool: [await vault.getAddress(), rate],
      YieldAggregator: [
        config.weth,
        await vault.getAddress(),
        await prizePool.getAddress(),
        config.comet
      ],
      LotteryRouter: [] // 无构造参数
    },
    config: {
      weth: config.weth,
      vrfCoordinator: config.vrfCoordinator,
      subscriptionId: config.subscriptionId,
      keyHash: config.keyHash,
      enableNativePayment: config.enableNativePayment,
      comet: config.comet,
      prizePoolRate: rate
    }
  }
  
  await saveDeploymentInfo(deploymentInfo)
  console.log("部署信息已成功保存")

}

// 执行主函数
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })