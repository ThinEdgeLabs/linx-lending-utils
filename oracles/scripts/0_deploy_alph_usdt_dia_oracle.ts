import { Deployer, DeployFunction, Network } from '@alephium/cli'
import { Settings } from '../alephium.config'
import { ALPHUSDTOracle } from '../artifacts/ts'
import { stringToHex, waitForTxConfirmation } from '@alephium/web3'
import { PrivateKeyWallet } from '@alephium/web3-wallet'

const deployOracle: DeployFunction<Settings> = async (
  deployer: Deployer,
  network: Network<Settings>
): Promise<void> => {
  const { diaOracleContractId, heartbeatInterval, alphUsdtOracle: oracleSettings } = network.settings

  if (
    !diaOracleContractId ||
    !oracleSettings?.baseMarketId ||
    !oracleSettings?.quoteMarketId ||
    !oracleSettings?.baseMarketDecimals ||
    !oracleSettings?.quoteMarketDecimals ||
    !oracleSettings?.baseTokenDecimals ||
    !oracleSettings?.quoteTokenDecimals ||
    !heartbeatInterval
  ) {
    throw new Error('Missing required settings to deploy the oracle contract.')
  }

  const result = await deployer.deployContract(ALPHUSDTOracle, {
    initialFields: {
      diaOracleContractId,
      baseMarketId: stringToHex(oracleSettings.baseMarketId),
      quoteMarketId: stringToHex(oracleSettings.quoteMarketId),
      heartbeatInterval,
      scaleFactor: 0n, // This will be calculated in the contract's init function
      baseMarketDecimals: oracleSettings.baseMarketDecimals,
      quoteMarketDecimals: oracleSettings.quoteMarketDecimals,
      baseTokenDecimals: oracleSettings.baseTokenDecimals,
      quoteTokenDecimals: oracleSettings.quoteTokenDecimals
    }
  })
  console.log(`${oracleSettings.baseMarketId} oracle contract id: ${result.contractInstance.contractId}`)
  console.log(`${oracleSettings.baseMarketId} oracle contract address: ${result.contractInstance.address}`)

  await waitForTxConfirmation(result.txId, 1, 3)

  const privateKey = network.privateKeys[0]
  const signer = new PrivateKeyWallet({ privateKey })

  const initResult = await ALPHUSDTOracle.at(result.contractInstance.address).transact.init({
    signer
  })
  await waitForTxConfirmation(initResult.txId, 1, 3)

  console.log(
    `Initialized ${oracleSettings.baseMarketId} oracle contract at address: ${result.contractInstance.address}`
  )

  const priceFetchResult = await ALPHUSDTOracle.at(result.contractInstance.address).view.price()
  console.log(`Fetched initial price oracle: ${priceFetchResult.returns.toString()}`)
}

export default deployOracle
