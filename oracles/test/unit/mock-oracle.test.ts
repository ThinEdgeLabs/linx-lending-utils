import { web3, ONE_ALPH } from '@alephium/web3'
import { PrivateKeyWallet } from '@alephium/web3-wallet'
import { MockOracle } from '../../artifacts/ts'
import { getSigner } from '@alephium/web3-test'
import { HUNDRED_ALPH, KEY, PRICE, setPrice } from '../utils'

web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)

describe('MockOracle', () => {
  let signer: PrivateKeyWallet

  /**
   * Sets up a signer wallet with a balance before running any tests in this describe block.
   */
  beforeAll(async () => {
    signer = await getSigner(HUNDRED_ALPH, 0)
  })

  /**
   * Tests the functionality of the `setPrice` function, which interacts with the MockOracle
   * to set a price for a given key. It verifies that the transaction is successful,
   * emits the 'PriceSet' event with the correct fields, and updates the `prices` map.
   */
  it('should set price', async () => {
    const result = await setPrice(signer.address)
    expect(result.returns).toBeDefined()
    expect(result.events).toBeDefined()

    const { events, maps } = result
    const set = events.find((event) => event.name === 'PriceSet')
    const { fields } = set!
    const { timestamp } = fields
    expect(set).toBeDefined()
    expect(fields).toEqual({ key: KEY, price: PRICE, timestamp })

    const { prices } = maps!
    expect(prices?.has(KEY)).toEqual(true)
    expect(prices?.get(KEY)).toEqual({ timestamp, value: PRICE })
  })

  /**
   * Tests the functionality to retrieve a price from the MockOracle using the `getValue` view function.
   * It first sets a price using the `setPrice` function and then calls `getValue` with the same key.
   * It verifies that the returned value and timestamp match the set price and the timestamp of the
   * 'PriceSet' event.
   */
  it('should get price', async () => {
    const result = await setPrice(signer.address)
    expect(result.returns).toBeDefined()
    expect(result.events).toBeDefined()

    const { events, maps } = result
    const set = events.find((event) => event.name === 'PriceSet')
    const { fields } = set!
    const setPriceTimestamp = fields.timestamp

    expect(set).toBeDefined()
    expect(fields).toEqual({ key: KEY, price: PRICE, timestamp: setPriceTimestamp })

    const view = await MockOracle.tests.getValue({
      initialMaps: maps,
      args: { key: KEY },
      inputAssets: [{ address: signer.address, asset: { alphAmount: ONE_ALPH * 100n } }]
    })

    expect(view.returns).toBeDefined()
    const {
      returns: [value, timestamp]
    } = view
    expect(value).toEqual(PRICE)
    expect(timestamp).toBeGreaterThan(0)
    expect(timestamp).toEqual(BigInt(Number(setPriceTimestamp)))
  })
})
