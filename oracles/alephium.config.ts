import { Configuration } from '@alephium/cli'
import { HexString } from '@alephium/web3'

export type Settings = {
  diaOracleContractId: HexString
  heartbeatInterval: bigint
  baseMarketId: HexString // Market ID to be set at deployment, e.g. 'BTC/USD' in hex format
  quoteMarketId: HexString // Market ID to be set at deployment, e.g. 'USDT/USD' in hex format
  baseMarketDecimals: bigint // Number of decimals for the base asset price (e.g., 8 for BTC/USD DIA feed)
  quoteMarketDecimals: bigint // Number of decimals for the quote asset price (e.g., 8 for USDT/USD DIA feed)
  baseTokenDecimals: bigint // Number of decimals for the base token (e.g., 18 for WBTC)
  quoteTokenDecimals: bigint // Number of decimals for the quote token (e.g., 6 for USDT)
}

const defaultSettings: Settings = {
  diaOracleContractId: '',
  baseMarketId: '',
  quoteMarketId: '',
  baseMarketDecimals: 0n,
  quoteMarketDecimals: 0n,
  baseTokenDecimals: 0n,
  quoteTokenDecimals: 0n,
  heartbeatInterval: 86400000n // 24 hours
}

const configuration: Configuration<Settings> = {
  networks: {
    devnet: {
      nodeUrl: 'http://127.0.0.1:22973',
      privateKeys: [
        'a642942e67258589cd2b1822c631506632db5a12aabcf413604e785300d762a5' // group 0
      ],
      settings: {
        ...defaultSettings,
        diaOracleContractId: '216wgM3Xi5uBFYwwiw2T7iZoCy9vozPJ4XjToW74nQjbV',
        baseMarketId: 'BTC/USD',
        quoteMarketId: 'USDT/USD',
        baseMarketDecimals: 8n,
        quoteMarketDecimals: 6n,
        baseTokenDecimals: 18n,
        quoteTokenDecimals: 6n
      }
    },

    testnet: {
      nodeUrl: (process.env.NODE_URL as string) ?? 'https://node.testnet.alephium.org',
      privateKeys: process.env.PRIVATE_KEYS === undefined ? [] : process.env.PRIVATE_KEYS.split(','),
      settings: {
        ...defaultSettings,
        diaOracleContractId: '216wgM3Xi5uBFYwwiw2T7iZoCy9vozPJ4XjToW74nQjbV' // DIA Oracle contract ID on testnet
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
