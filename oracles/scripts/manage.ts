import { web3 } from '@alephium/web3'
import { ALPHUSDTOracle } from '../artifacts/ts'

/**
 * Fetch the current price from the ALPHUSDT oracle
 */
async function fetchOraclePrice() {
  // Configuration
  const nodeUrl = process.env.NODE_URL || 'https://node.mainnet.alephium.org'
  const network = process.env.NETWORK || 'mainnet'

  web3.setCurrentNodeProvider(nodeUrl)

  // Oracle contract address from deployments
  // You can also pass this as a command line argument
  const oracleAddress = process.env.ORACLE_ADDRESS || 'uEvUfyyn6iKeDUhfAyzVk1Rxeytf1psffwCwhMg4Wf3V' // Mainnet ALPHUSDT oracle

  console.log(`Connecting to ${network} at ${nodeUrl}`)
  console.log(`Oracle address: ${oracleAddress}`)
  console.log('---')

  try {
    // Get the oracle contract instance
    const oracle = ALPHUSDTOracle.at(oracleAddress)

    // Fetch the current price
    console.log('Fetching current price from oracle...')
    const result = await oracle.view.price()

    // The price is returned with 18 decimals (WAD format)
    const price = result.returns
    const priceInDecimal = Number(price) / 1e18

    console.log(`Raw price (WAD format): ${price.toString()}`)
    console.log(`Price in decimal: ${priceInDecimal.toFixed(6)}`)
    console.log(`Price formatted: $${priceInDecimal.toFixed(2)}`)

    return price
  } catch (error) {
    console.error('Error fetching oracle price:', error)
    throw error
  }
}

// Run the script
if (require.main === module) {
  fetchOraclePrice()
    .then(() => {
      console.log('\n✓ Successfully fetched oracle price')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n✗ Failed to fetch oracle price:', error)
      process.exit(1)
    })
}

export { fetchOraclePrice }
