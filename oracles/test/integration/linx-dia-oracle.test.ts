import { web3, stringToHex, MINIMAL_CONTRACT_DEPOSIT } from '@alephium/web3'
import { PrivateKeyWallet } from '@alephium/web3-wallet'
import { OracleExample, OracleExampleInstance, MockOracle, MockOracleInstance } from '../../artifacts/ts'
import { getSigner, expectAssertionError } from '@alephium/web3-test'
import { HUNDRED_ALPH } from '../utils'

web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)

describe('LinxDIAOracle', () => {
  let mockOracle: MockOracleInstance
  let linxOracle: OracleExampleInstance
  let signer: PrivateKeyWallet

  const baseMarketId = stringToHex('BTC/USD')
  const quoteMarketId = stringToHex('USDT/USD')
  const baseMarketDecimals = 8n
  const quoteMarketDecimals = 8n
  const baseTokenDecimals = 18n
  const quoteTokenDecimals = 6n
  const heartbeatInterval = 1000 // 1 second

  beforeAll(async () => {
    signer = await getSigner(HUNDRED_ALPH, 0)
    mockOracle = (await MockOracle.deploy(signer, { initialFields: {} })).contractInstance

    linxOracle = (
      await OracleExample.deploy(signer, {
        initialFields: {
          diaOracleContractId: mockOracle.contractId,
          baseMarketId: stringToHex('BTC/USD'),
          quoteMarketId: stringToHex('USDT/USD'),
          baseMarketDecimals,
          quoteMarketDecimals,
          baseTokenDecimals,
          quoteTokenDecimals,
          heartbeatInterval: BigInt(heartbeatInterval),
          scaleFactor: 0n
        }
      })
    ).contractInstance
  })

  it('should initialize all fields correctly', async () => {
    const { fields } = await linxOracle.fetchState()
    const {
      diaOracleContractId,
      baseMarketId,
      quoteMarketId,
      baseMarketDecimals,
      quoteMarketDecimals,
      baseTokenDecimals,
      quoteTokenDecimals,
      heartbeatInterval
    } = fields
    expect(diaOracleContractId).toEqual(mockOracle.contractId)
    expect(baseMarketId).toEqual(baseMarketId)
    expect(quoteMarketId).toEqual(quoteMarketId)
    expect(baseMarketDecimals).toEqual(baseMarketDecimals)
    expect(quoteMarketDecimals).toEqual(quoteMarketDecimals)
    expect(baseTokenDecimals).toEqual(baseTokenDecimals)
    expect(quoteTokenDecimals).toEqual(quoteTokenDecimals)
    expect(heartbeatInterval).toEqual(heartbeatInterval)
  })

  it('should fail to get price before initialization', async () => {
    await expectAssertionError(
      linxOracle.view.price(),
      linxOracle.address,
      OracleExample.consts.ErrorCodes.NotInitialized
    )
  })

  it('should return the price with the correct scale factor', async () => {
    await linxOracle.transact.init({
      signer
    })
    const basePrice = BigInt(1000.12345678 * 10 ** 8)
    await mockOracle.transact.setPrice({
      signer,
      attoAlphAmount: MINIMAL_CONTRACT_DEPOSIT,
      args: { key: baseMarketId, price: basePrice }
    })

    const quotePrice = BigInt(1.00000001 * 10 ** 8)
    await mockOracle.transact.setPrice({
      signer,
      attoAlphAmount: MINIMAL_CONTRACT_DEPOSIT,
      args: { key: quoteMarketId, price: quotePrice }
    })

    const scaleFactor = (await linxOracle.fetchState()).fields.scaleFactor
    expect(scaleFactor).toEqual(
      10n ** (36n + quoteTokenDecimals + quoteMarketDecimals - baseTokenDecimals - baseMarketDecimals)
    )
    const price = (await linxOracle.view.price()).returns
    expect(price).toEqual((basePrice * scaleFactor) / quotePrice)
  })

  it('should fail if oracle data is stale', async () => {
    await linxOracle.transact.init({
      signer
    })
    await new Promise((r) => setTimeout(r, heartbeatInterval))
    await expectAssertionError(linxOracle.view.price(), linxOracle.address, OracleExample.consts.ErrorCodes.StalePrice)
  })
})
