import { web3, TestContractParams, NamedVals, ONE_ALPH, prettifyExactAmount } from '@alephium/web3'
import {
  expectAssertionError,
  testNodeWallet,
  randomContractId,
  randomContractAddress,
  getSigner
} from '@alephium/web3-test'
import { DynamicRate, DynamicRateTypes } from '../../artifacts/ts'
import { describe, it, expect, beforeAll } from '@jest/globals'

describe('dynamic rate unit tests', () => {
  let testContractAddress: string
  let testParamsFixture: TestContractParams<DynamicRateTypes.Fields, NamedVals>
  let linxAddress: string
  let testContractId: string

  beforeAll(async () => {
    web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)

    const signer = await testNodeWallet()
    const accounts = await signer.getAccounts()
    const account = accounts[0]
    await signer.setSelectedAccount(account.address)
    linxAddress = account.address
    testContractAddress = randomContractAddress()

    testContractId = randomContractId()

    testParamsFixture = {
      initialAsset: { alphAmount: 10n ** 18n },
      initialFields: {
        linx: linxAddress
      },
      contractAddress: testContractAddress,
      inputAssets: [{ address: linxAddress, asset: { alphAmount: 10n ** 18n } }],
      args: {}
    }
  })

  it('test borrowRateView for first interaction', async () => {
    const marketParams = {
      loanToken: testContractId,
      collateralToken: testContractId,
      oracle: testContractId,
      interestRateModel: testContractId,
      loanToValue: 75n * 10n ** 16n // 75% LTV
    }

    const marketState = {
      totalSupplyAssets: 100n * 10n ** 18n,
      totalSupplyShares: 100n * 10n ** 18n,
      totalBorrowAssets: 90n * 10n ** 18n, // 50% utilization
      totalBorrowShares: 90n * 10n ** 18n,
      lastUpdate: 1000n,
      fee: 0n
    }

    const testParams = {
      ...testParamsFixture,
      args: {
        marketParams,
        marketState
      },
      initialFields: {
        linx: linxAddress
      },
      initialMaps: {
        rateAtTarget: new Map<string, bigint>()
      }
    }

    const state = await DynamicRate.tests.initInterest(testParams)
    const testResult = await DynamicRate.tests.borrowRate({ ...testParams, initialMaps: state.maps })

    // For first interaction, should return the initial rate at target
    expect(testResult.returns).toEqual(DynamicRate.consts.INITIAL_RATE_AT_TARGET)
  })

  it('test borrowRate requires authorization', async () => {
    const marketParams = {
      loanToken: testContractId,
      collateralToken: testContractId,
      oracle: testContractId,
      interestRateModel: testContractId,
      loanToValue: 75n * 10n ** 16n // 75% LTV
    }

    const marketState = {
      totalSupplyAssets: 100n * 10n ** 18n,
      totalSupplyShares: 100n * 10n ** 18n,
      totalBorrowAssets: 50n * 10n ** 18n,
      totalBorrowShares: 50n * 10n ** 18n,
      lastUpdate: 1000n,
      fee: 0n
    }

    const unauthorizedAddress = (await getSigner(ONE_ALPH)).address
    const testParams = {
      ...testParamsFixture,
      inputAssets: [{ address: unauthorizedAddress, asset: { alphAmount: 10n ** 18n } }],
      args: {
        marketParams,
        marketState
      }
    }

    await expectAssertionError(
      DynamicRate.tests.borrowRate(testParams),
      testContractAddress,
      Number(DynamicRate.consts.ErrorCodes.NotAuthorized)
    )
  })

  it('test borrowRate with successful update', async () => {
    const marketParams = {
      loanToken: testContractId,
      collateralToken: testContractId,
      oracle: testContractId,
      interestRateModel: testContractId,
      loanToValue: 75n * 10n ** 16n // 75% LTV
    }

    const marketState = {
      totalSupplyAssets: 100n * 10n ** 18n,
      totalSupplyShares: 100n * 10n ** 18n,
      totalBorrowAssets: 80n * 10n ** 18n, // 80% utilization (at target)
      totalBorrowShares: 80n * 10n ** 18n,
      lastUpdate: 1000n,
      fee: 0n
    }

    const testParams = {
      ...testParamsFixture,
      args: {
        marketParams,
        marketState
      }
    }

    const state = await DynamicRate.tests.initInterest(testParams)
    const testResult = await DynamicRate.tests.borrowRate({ ...testParams, initialMaps: state.maps })

    expect(testResult.returns).toBeDefined()
    expect(testResult.returns > 0n).toBeTruthy()

    // Check that we've emitted a BorrowRateUpdate event
    expect(testResult.events.length).toEqual(1)
    const borrowRateEvent = testResult.events.find((event) => event.name === 'BorrowRateUpdate')
    expect(borrowRateEvent).toBeDefined()
    const event = borrowRateEvent as DynamicRateTypes.BorrowRateUpdateEvent
    expect(event.name).toEqual('BorrowRateUpdate')
    expect(event.fields.avgBorrowRate).toEqual(testResult.returns)
  })

  it('test borrowRate with high utilization', async () => {
    const marketParams = {
      loanToken: testContractId,
      collateralToken: testContractId,
      oracle: testContractId,
      interestRateModel: testContractId,
      loanToValue: 75n * 10n ** 16n // 75% LTV
    }

    const marketState = {
      totalSupplyAssets: 100n * 10n ** 18n,
      totalSupplyShares: 100n * 10n ** 18n,
      totalBorrowAssets: 95n * 10n ** 18n, // 95% utilization (above target)
      totalBorrowShares: 95n * 10n ** 18n,
      lastUpdate: 1000n,
      fee: 0n
    }

    const testParams = {
      ...testParamsFixture,
      args: {
        marketParams,
        marketState
      }
    }

    const state = await DynamicRate.tests.initInterest(testParams)
    const testResultHigh = await DynamicRate.tests.borrowRate({ ...testParams, initialMaps: state.maps })
    console.log(`High utilization borrow rate: ${prettifyExactAmount(testResultHigh.returns * 31536000n, 18)}`)

    // Now test with lower utilization to compare
    const marketStateWithLowUtilization = {
      ...marketState,
      totalBorrowAssets: 50n * 10n ** 18n // 50% utilization (below target)
    }

    const testParamsLow = {
      ...testParamsFixture,
      args: {
        marketParams,
        marketState: marketStateWithLowUtilization
      }
    }

    const testResultLow = await DynamicRate.tests.borrowRate({ ...testParamsLow, initialMaps: state.maps })
    console.log(`Low utilization borrow rate: ${prettifyExactAmount(testResultLow.returns * 31536000n, 18)}`)
    // High utilization should give higher rate
    expect(testResultHigh.returns > testResultLow.returns).toBeTruthy()
  })

  it('test borrowRate with zero supply assets', async () => {
    const marketParams = {
      loanToken: testContractId,
      collateralToken: testContractId,
      oracle: testContractId,
      interestRateModel: testContractId,
      loanToValue: 75n * 10n ** 16n // 75% LTV
    }

    const marketState = {
      totalSupplyAssets: 0n,
      totalSupplyShares: 0n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      lastUpdate: 1000n,
      fee: 0n
    }

    const testParams = {
      ...testParamsFixture,
      args: {
        marketParams,
        marketState
      }
    }

    // Should not revert with division by zero
    const state = await DynamicRate.tests.initInterest(testParams)
    const testResult = await DynamicRate.tests.borrowRate({ ...testParams, initialMaps: state.maps })
    expect(testResult.returns).toBeDefined()
  })

  it('test rate adjustment over time', async () => {
    const marketParams = {
      loanToken: testContractId,
      collateralToken: testContractId,
      oracle: testContractId,
      interestRateModel: testContractId,
      loanToValue: 75n * 10n ** 16n // 75% LTV
    }

    const lastUpdate = Date.now()

    const marketState = {
      totalSupplyAssets: 100n * 10n ** 18n,
      totalSupplyShares: 100n * 10n ** 18n,
      totalBorrowAssets: 80n * 10n ** 18n, // 80% utilization (at target)
      totalBorrowShares: 80n * 10n ** 18n,
      lastUpdate: BigInt(lastUpdate),
      fee: 0n
    }

    const initialTestParams = {
      ...testParamsFixture,
      args: {
        marketParams,
        marketState
      },
      blockTimeStamp: lastUpdate
    }

    const state = await DynamicRate.tests.initInterest(initialTestParams)
    const initialResult = await DynamicRate.tests.borrowRate({ ...initialTestParams, initialMaps: state.maps })

    // One week later with increased utilization
    const laterMarketState = {
      ...marketState,
      totalBorrowAssets: 95n * 10n ** 18n,
      lastUpdate: BigInt(lastUpdate - 60 * 60 * 24 * 7 * 1000)
    }

    const laterTestParams = {
      ...testParamsFixture,
      args: {
        marketParams,
        marketState: laterMarketState
      }
    }
    const laterResult = await DynamicRate.tests.borrowRate({ ...laterTestParams, initialMaps: state.maps })
    expect(laterResult.returns > initialResult.returns).toBeTruthy()
    expect(initialResult.returns < DynamicRate.consts.INITIAL_RATE_AT_TARGET).toBe(true)
    expect(prettifyExactAmount(initialResult.returns * 31536000n, 18)).toBe('0.036666666643392')
    expect(prettifyExactAmount(laterResult.returns * 31536000n, 18)).toBe('0.1288798993728')
  })
})
