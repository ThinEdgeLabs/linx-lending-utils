import { Configuration } from '@alephium/cli'
import { HexString } from '@alephium/web3'

// Settings are usually for configuring
export type Settings = {
  diaOracleAddress: HexString
  marketId: HexString
  heartbeatInterval: bigint
}

const configuration: Configuration<Settings> = {
  networks: {
    devnet: {
      nodeUrl: 'https://node.testnet.alephium.org',
      privateKeys: [
        'a642942e67258589cd2b1822c631506632db5a12aabcf413604e785300d762a5' // group 0
      ],
      settings: undefined as unknown as Settings
    },

    testnet: {
      nodeUrl: (process.env.NODE_URL as string) ?? 'https://node.testnet.alephium.org',
      privateKeys: process.env.PRIVATE_KEYS === undefined ? [] : process.env.PRIVATE_KEYS.split(','),
      settings: undefined as unknown as Settings
    },

    mainnet: {
      nodeUrl: (process.env.NODE_URL as string) ?? 'https://node.mainnet.alephium.org',
      privateKeys: process.env.PRIVATE_KEYS === undefined ? [] : process.env.PRIVATE_KEYS.split(','),
      settings: undefined as unknown as Settings
    }
  }
}

export default configuration
