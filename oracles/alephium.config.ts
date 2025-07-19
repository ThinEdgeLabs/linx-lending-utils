import { Configuration } from '@alephium/cli'
import { addressFromContractId, HexString, NULL_CONTRACT_ADDRESS } from '@alephium/web3'

export type Settings = {
  diaOracleAddress: HexString
  marketId: HexString
  heartbeatInterval: bigint
}

const defaultSettings: Settings = {
  diaOracleAddress: NULL_CONTRACT_ADDRESS,
  marketId: '', // Market ID to be set at deployment, e.g. 'BTC/USD' in hex format
  heartbeatInterval: 86400000n // 24 hours
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
      settings: {
        ...defaultSettings,
        diaOracleAddress: addressFromContractId('216wgM3Xi5uBFYwwiw2T7iZoCy9vozPJ4XjToW74nQjbV') // DIA Oracle address on testnet
      }
    },

    mainnet: {
      nodeUrl: (process.env.NODE_URL as string) ?? 'https://node.mainnet.alephium.org',
      privateKeys: process.env.PRIVATE_KEYS === undefined ? [] : process.env.PRIVATE_KEYS.split(','),
      settings: defaultSettings
    }
  }
}

export default configuration
