import { Address, ONE_ALPH, stringToHex } from '@alephium/web3'
import { MockDIAOracle } from '../artifacts/ts'

export const KEY = stringToHex('ALPH/USD')
export const PRICE = BigInt(0.37122630952673946 * 10 ** 18)
export const HUNDRED_ALPH = ONE_ALPH * 100n

export async function setPrice(address: Address) {
  return await MockDIAOracle.tests.setPrice({
    initialMaps: {},
    args: { key: KEY, price: PRICE },
    inputAssets: [{ address, asset: { alphAmount: HUNDRED_ALPH } }]
  })
}

export async function fetchPrice() {
  const url = 'https://api.diadata.org/v1/assetQuotation/Alephium/tgx7VNFoP9DJiFMFgXXtafQZkUvyEdDHT9ryamHJYrjq'
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`)
    }

    const { Price: price } = await response.json()
    return price
  } catch (error: any) {
    console.error(error.message)
  }
}
