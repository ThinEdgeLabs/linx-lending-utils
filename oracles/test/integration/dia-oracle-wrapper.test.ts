import { stringToHex, web3, ONE_ALPH } from '@alephium/web3'
import { PrivateKeyWallet } from '@alephium/web3-wallet'
import { DIAOracleWrapper, DIAOracleWrapperInstance, MockDIAOracle, MockDIAOracleInstance } from '../../artifacts/ts'
import { getSigner, expectAssertionError } from '@alephium/web3-test'
import { HUNDRED_ALPH, KEY, PRICE } from '../utils'

web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)

describe('DIAOracleWrapper', () => {
  let diaOracleWrapper: DIAOracleWrapperInstance
  let mockOracle: MockDIAOracleInstance
  let signer: PrivateKeyWallet

  /**
   * Deploys the mock DIA oracle and the DIA oracle wrapper contracts before running any tests.
   * It initializes the oracle wrapper with the address of the mock oracle, a market ID,
   * and a heartbeat interval.
   */
  beforeAll(async () => {
    signer = await getSigner(HUNDRED_ALPH, 0)
    mockOracle = (await MockDIAOracle.deploy(signer, { initialFields: {} })).contractInstance
    diaOracleWrapper = (
      await DIAOracleWrapper.deploy(signer, {
        initialFields: {
          diaOracleAddress: mockOracle.address,
          marketId: stringToHex('ALPH/USD'),
          heartbeatInterval: BigInt(100)
        }
      })
    ).contractInstance
  })

  /**
   * Tests that both the DIA oracle wrapper and the mock DIA oracle contracts are deployed successfully
   * by checking if their addresses are defined.
   */
  it('should be deployed', async () => {
    expect(diaOracleWrapper.address).toBeDefined()
    expect(mockOracle.address).toBeDefined()
  })

  /**
   * Tests that the initial fields of the DIA oracle wrapper contract are set correctly during deployment.
   * It fetches the contract state and compares the stored values with the deployment parameters.
   */
  it('should initialize all fields correctly', async () => {
    const { fields } = await diaOracleWrapper.fetchState()
    const { diaOracleAddress, marketId, heartbeatInterval } = fields
    expect(diaOracleAddress).toEqual(diaOracleAddress)
    expect(marketId).toEqual(marketId)
    expect(heartbeatInterval).toEqual(heartbeatInterval)
  })

  /**
   * Tests the functionality of the oracle wrapper to retrieve the price from the underlying DIA oracle.
   * It first sets a price in the mock oracle and then calls the `price` view function of the wrapper
   * to ensure it returns the same price.
   */
  it('oracle wrapper should get price', async () => {
    await mockOracle.transact.setPrice({
      signer,
      attoAlphAmount: ONE_ALPH,
      args: { key: KEY, price: PRICE }
    })

    const mould = await mockOracle.view.getValue({ args: { key: KEY } })
    const [value, timestamp] = mould.returns
    expect(value).toEqual(PRICE)
    expect(timestamp).toBeGreaterThan(0)

    const oracleWrapperState = await diaOracleWrapper.fetchState()
    expect(oracleWrapperState.fields.diaOracleAddress).toEqual(mockOracle.address)

    const wrapper = await diaOracleWrapper.view.price()
    const wrapped = wrapper.returns
    expect(wrapped).toEqual(PRICE)
  })

  /**
   * Tests that the oracle wrapper returns an assertion error when the data from the underlying
   * DIA oracle is considered stale based on the `heartbeatInterval`.
   * It waits for a duration longer than the heartbeat interval and then attempts to fetch the price.
   */
  it('should error when stale', async () => {
    const oracleWrapperState = await diaOracleWrapper.fetchState()
    expect(oracleWrapperState.fields.diaOracleAddress).toEqual(mockOracle.address)

    // Wait for longer than the heartbeat interval
    await new Promise((r) => setTimeout(r, 1000))
    await expectAssertionError(
      diaOracleWrapper.view.price(),
      diaOracleWrapper.address,
      DIAOracleWrapper.consts.ErrorCodes.StalePrice
    )
  })
})
