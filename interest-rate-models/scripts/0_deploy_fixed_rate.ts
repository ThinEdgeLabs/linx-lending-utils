import { Deployer, DeployFunction, Network } from '@alephium/cli'
import { Settings } from '../alephium.config'
import { FixedRate } from '../artifacts/ts'

const deployFixedRate: DeployFunction<Settings> = async (
  deployer: Deployer,
  network: Network<Settings>
): Promise<void> => {
  const initialRate = network.settings.initialRate || 50000000000000000n // Default to 5% (0.05 * 10^18)

  const result = await deployer.deployContract(FixedRate, {
    initialFields: {
      admin: deployer.account.address,
      rate: BigInt(initialRate),
      rateUpdated: false
    }
  })

  console.log('Fixed Rate contract id: ' + result.contractInstance.contractId)
  console.log('Fixed Rate contract address: ' + result.contractInstance.address)
}

export default deployFixedRate
