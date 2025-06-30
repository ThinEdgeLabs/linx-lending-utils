import { web3, TestContractParams } from '@alephium/web3'
import { expectAssertionError, testNodeWallet, randomContractId, randomContractAddress } from '@alephium/web3-test'
import { DynamicRate, DynamicRateTypes } from '../../artifacts/ts'
import { describe, it, expect, beforeAll, jest } from '@jest/globals'

// Increase timeout for all tests in this file
jest.setTimeout(15000)

describe('dynamic rate unit tests', () => {
  let testContractAddress: string
  let testParamsFixture: TestContractParams<DynamicRateTypes.Fields, {}>
  //let dynamicRate: any
  let linxAddress: string
  let testContractId: string

  // We initialize the fixture variables before all tests
  beforeAll(async () => {
    web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)

    // Deploy the contract to devnet
    const signer = await testNodeWallet()
    const accounts = await signer.getAccounts()
    const account = accounts[0]
    await signer.setSelectedAccount(account.address)
    linxAddress = account.address
    //dynamicRate = deployments.getInstance(DynamicRate, testGroup)
    testContractAddress = randomContractAddress()

    testContractId = randomContractId()

    testParamsFixture = {
      // Assets owned by the test contract before a test
      initialAsset: { alphAmount: 10n ** 18n },
      // Initial state of the test contract
      initialFields: {
        linx: linxAddress
      },
      contractAddress: testContractAddress,
      // Assets owned by the caller of the function
      inputAssets: [{ address: linxAddress, asset: { alphAmount: 10n ** 18n } }],
      // Empty test args will be overridden in each test
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
      totalSupplyAssets: 100n * 10n ** 18n, // 100 tokens
      totalSupplyShares: 100n * 10n ** 18n,
      totalBorrowAssets: 50n * 10n ** 18n, // 50% utilization
      totalBorrowShares: 50n * 10n ** 18n,
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

    const testResult = await DynamicRate.tests.borrowRate(testParams)

    // For first interaction, should return the initial rate at target
    // with appropriate curve adjustment based on utilization
    expect(testResult.returns).toBeDefined()
    expect(testResult.returns > 0n).toBeTruthy()
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

    // Get an actual wallet address that's different from linx
    const signer = await testNodeWallet()
    const accounts = await signer.getAccounts()
    // Find an account different from linx
    const unauthorizedAccount = accounts.find((acc) => acc.address !== linxAddress) || accounts[0]
    const unauthorizedAddress = unauthorizedAccount.address
    console.log(testParamsFixture)
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

    const testResult = await DynamicRate.tests.borrowRate(testParams)

    // Check the return value
    expect(testResult.returns).toBeDefined()
    expect(testResult.returns > 0n).toBeTruthy()

    // Check that we've emitted a BorrowRateUpdate event
    expect(testResult.events.length).toEqual(2)
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

    const testResultHigh = await DynamicRate.tests.borrowRate(testParams)

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

    const testResultLow = await DynamicRate.tests.borrowRate(testParamsLow)

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
      totalSupplyAssets: 0n, // Zero supply
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
    const testResult = await DynamicRate.tests.borrowRate(testParams)
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

    const marketState = {
      totalSupplyAssets: 100n * 10n ** 18n,
      totalSupplyShares: 100n * 10n ** 18n,
      totalBorrowAssets: 80n * 10n ** 18n, // 80% utilization (at target)
      totalBorrowShares: 80n * 10n ** 18n,
      lastUpdate: 100000n, // Some past timestamp
      fee: 0n
    }

    const initialTestParams = {
      ...testParamsFixture,
      args: {
        marketParams,
        marketState
      }
    }

    const initialResult = await DynamicRate.tests.borrowRate(initialTestParams)

    // Now simulate passage of time and changed utilization
    const laterMarketState = {
      ...marketState,
      totalBorrowAssets: 90n * 10n ** 18n, // 90% utilization (above target)
      lastUpdate: 110000n // 10,000 units of time later
    }

    const laterTestParams = {
      ...testParamsFixture,
      args: {
        marketParams,
        marketState: laterMarketState
      }
    }

    const laterResult = await DynamicRate.tests.borrowRate(laterTestParams)

    // Rates should adjust over time, with higher utilization leading to higher rates
    expect(laterResult.returns > initialResult.returns).toBeTruthy()
  })
})
