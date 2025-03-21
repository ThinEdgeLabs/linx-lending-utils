import { Deployer, DeployFunction, Network } from '@alephium/cli'
import { Settings } from '../alephium.config'
import { DIAOracleWrapper } from '../artifacts/ts'
import { stringToHex } from '@alephium/web3'

// This deploy function will be called by cli deployment tool automatically
// Note that deployment scripts should prefixed with numbers (starting from 0)
const deployFaucet: DeployFunction<Settings> = async (
  deployer: Deployer,
  network: Network<Settings>
): Promise<void> => {
  // Get settings
  const { diaOracleAddress, marketId, heartbeatInterval } = network.settings

  const result = await deployer.deployContract(DIAOracleWrapper, {
    // The initial states of the faucet contract
    initialFields: {
      diaOracleAddress,
      marketId,
      heartbeatInterval
    }
  })
  console.log('DIA Contract Wrapper contract id: ' + result.contractInstance.contractId)
  console.log('DIA Contract Wrapper contract address: ' + result.contractInstance.address)
}

export default deployFaucet
