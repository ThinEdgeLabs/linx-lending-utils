import { Deployer, DeployFunction, Network } from '@alephium/cli'
import { Settings } from '../alephium.config'
import { DynamicRate } from '../artifacts/ts'

// Deploy the DynamicRate contract
const deployDynamicRate: DeployFunction<Settings> = async (
  deployer: Deployer,
  network: Network<Settings>
): Promise<void> => {
  const linxAddress = network.settings.linxAddress || deployer.account.address // Using deployer account as linx for testing

  console.log(`Using Linx Address:  ${linxAddress}`)

  // Deploy the DynamicRate contract
  const result = await deployer.deployContract(DynamicRate, {
    // The initial states of the dynamic rate contract
    initialFields: {
      linx: linxAddress
    }
  })

  console.log('Dynamic Rate contract id: ' + result.contractInstance.contractId)
  console.log('Dynamic Rate contract address: ' + result.contractInstance.address)
}

export default deployDynamicRate
