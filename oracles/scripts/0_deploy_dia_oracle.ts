import { Deployer, DeployFunction, Network } from '@alephium/cli'
import { Settings } from '../alephium.config'
import { DIAOracleWrapper } from '../artifacts/ts'
import { stringToHex } from '@alephium/web3'

const deployOracle: DeployFunction<Settings> = async (
  deployer: Deployer,
  network: Network<Settings>
): Promise<void> => {
  const { diaOracleAddress, heartbeatInterval, marketId } = network.settings

  if (!marketId) {
    throw new Error('Market ID is required to deploy the DIA Oracle Wrapper contract.')
  }

  const result = await deployer.deployContract(DIAOracleWrapper, {
    initialFields: {
      diaOracleAddress,
      marketId: stringToHex(marketId),
      heartbeatInterval
    }
  })
  console.log(`DIA ${marketId} Oracle contract id: ${result.contractInstance.contractId}`)
  console.log(`DIA ${marketId} Contract Wrapper contract address: ${result.contractInstance.address}`)
}

export default deployOracle
