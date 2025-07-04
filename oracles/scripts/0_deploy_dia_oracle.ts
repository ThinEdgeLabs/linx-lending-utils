import { Deployer, DeployFunction, Network } from '@alephium/cli'
import { Settings } from '../alephium.config'
import { DIAOracleWrapper } from '../artifacts/ts'

const deployOracle: DeployFunction<Settings> = async (
  deployer: Deployer,
  network: Network<Settings>
): Promise<void> => {
  const { diaOracleAddress, marketId, heartbeatInterval } = network.settings

  const result = await deployer.deployContract(DIAOracleWrapper, {
    initialFields: {
      diaOracleAddress,
      marketId,
      heartbeatInterval
    }
  })
  console.log('DIA Contract Wrapper contract id: ' + result.contractInstance.contractId)
  console.log('DIA Contract Wrapper contract address: ' + result.contractInstance.address)
}

export default deployOracle
