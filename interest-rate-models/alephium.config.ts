import { Configuration } from '@alephium/cli'
import { Number256 } from '@alephium/web3'

export type Settings = {
  initialRate: Number256
  linxAddress: string
}

const defaultSettings: Settings = {
  initialRate: 50000000000000000n, // 5% (0.05 * 10^18) for fixed-rate
  linxAddress: ''
}

const configuration: Configuration<Settings> = {
  networks: {
    devnet: {
      nodeUrl: 'http://127.0.0.1:22973',
      privateKeys: [
        'a642942e67258589cd2b1822c631506632db5a12aabcf413604e785300d762a5' // group 0
      ],
      settings: defaultSettings
    },

    testnet: {
      nodeUrl: (process.env.NODE_URL as string) ?? 'https://node.testnet.alephium.org',
      privateKeys: process.env.PRIVATE_KEYS === undefined ? [] : process.env.PRIVATE_KEYS.split(','),
      settings: defaultSettings
    },

    mainnet: {
      nodeUrl: (process.env.NODE_URL as string) ?? 'https://node.mainnet.alephium.org',
      privateKeys: process.env.PRIVATE_KEYS === undefined ? [] : process.env.PRIVATE_KEYS.split(','),
      settings: defaultSettings
    }
  }
}

export default configuration
