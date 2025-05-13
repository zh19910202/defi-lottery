const { run, network } = require("hardhat")
const fs = require("fs")
const path = require("path")

async function main () {
  const filePath = path.join(__dirname, `../deployments/${network.name}.json`)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  for (const [name, address] of Object.entries(data.contracts)) {
    const args = data.constructorArgs[name] || []
    console.log(`Verifying ${name} at ${address} with args:`, args)

    try {
      await run("verify:verify", {
        address,
        constructorArguments: args
      })
    } catch (e) {
      console.error(`Failed to verify ${name}:`, e.message)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
