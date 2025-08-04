import { Deployer, DeployFunction, Network } from '@alephium/cli'
import { Settings } from '../alephium.config'
import { DynamicRate } from '../artifacts/ts'

const deployDynamicRate: DeployFunction<Settings> = async (
  deployer: Deployer,
  network: Network<Settings>
): Promise<void> => {
  const linxAddress = network.settings.linxAddress

  console.log(`Using Linx Address:  ${linxAddress}`)

  const result = await deployer.deployContract(DynamicRate, {
    initialFields: {
      linx: linxAddress
    }
  })

  console.log('Dynamic Rate contract id: ' + result.contractInstance.contractId)
  console.log('Dynamic Rate contract address: ' + result.contractInstance.address)
}

export default deployDynamicRate
