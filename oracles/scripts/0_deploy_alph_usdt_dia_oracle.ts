import { Deployer, DeployFunction, Network } from '@alephium/cli'
import { Settings } from '../alephium.config'
import { AlphUsdtOracle } from '../artifacts/ts'
import { stringToHex } from '@alephium/web3'
import { PrivateKeyWallet } from '@alephium/web3-wallet'

const deployOracle: DeployFunction<Settings> = async (
  deployer: Deployer,
  network: Network<Settings>
): Promise<void> => {
  const {
    diaOracleContractId,
    heartbeatInterval,
    baseMarketId,
    quoteMarketId,
    baseMarketDecimals,
    quoteMarketDecimals,
    baseTokenDecimals,
    quoteTokenDecimals
  } = network.settings

  if (
    !diaOracleContractId ||
    !baseMarketId ||
    !quoteMarketId ||
    !baseMarketDecimals ||
    !quoteMarketDecimals ||
    !baseTokenDecimals ||
    !quoteTokenDecimals ||
    !heartbeatInterval
  ) {
    throw new Error('Missing required settings to deploy the LinxDIAOracle contract.')
  }

  const result = await deployer.deployContract(AlphUsdtOracle, {
    initialFields: {
      diaOracleContractId,
      baseMarketId: stringToHex(baseMarketId),
      quoteMarketId: stringToHex(quoteMarketId),
      heartbeatInterval,
      scaleFactor: 0n, // This will be calculated in the contract's init function
      baseMarketDecimals,
      quoteMarketDecimals,
      baseTokenDecimals,
      quoteTokenDecimals
    }
  })
  console.log(`${baseMarketId} oracle contract id: ${result.contractInstance.contractId}`)
  console.log(`${baseMarketId} oracle contract address: ${result.contractInstance.address}`)

  const privateKey = network.privateKeys[0]
  const signer = new PrivateKeyWallet({ privateKey })
  AlphUsdtOracle.at(result.contractInstance.address).transact.init({
    signer
  })

  console.log(`Initialized ${baseMarketId} oracle contract at address: ${result.contractInstance.address}`)
}

export default deployOracle
