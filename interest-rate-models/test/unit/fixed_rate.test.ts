import { web3, TestContractParams, ONE_ALPH } from '@alephium/web3'
import {
  testAddress,
  expectAssertionError,
  testNodeWallet,
  randomContractId,
  randomContractAddress,
  getSigner
} from '@alephium/web3-test'
import { FixedRate, FixedRateTypes } from '../../artifacts/ts'
import { describe, it, expect, beforeAll } from '@jest/globals'

describe('unit tests', () => {
  let testParamsFixture: TestContractParams<FixedRateTypes.Fields, { newBorrowRate: bigint }>
  let testContractId: string

  beforeAll(async () => {
    web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)

    const signer = await testNodeWallet()
    const account = (await signer.getAccounts())[0]
    await signer.setSelectedAccount(account.address)

    testContractId = randomContractId()

    testParamsFixture = {
      contractAddress: randomContractAddress(),
      initialAsset: { alphAmount: 10n ** 18n },
      initialFields: {
        admin: testAddress,
        rate: 100000000000000000n,
        rateUpdated: false
      },
      args: { newBorrowRate: 50000000000000000n }, // 0.05 * 10^18 = 5%
      inputAssets: [{ address: testAddress, asset: { alphAmount: 10n ** 18n } }]
    }
  })

  it('test getRate', async () => {
    const testParams = {
      ...testParamsFixture,
      args: {}
    }

    const testResult = await FixedRate.tests.getRate(testParams)

    expect(testResult.returns).toEqual(100000000000000000n)

    // Verify contract state remains unchanged
    const contractState = testResult.contracts[0] as FixedRateTypes.State
    expect(contractState.fields.rate).toEqual(100000000000000000n)
    expect(contractState.fields.rateUpdated).toEqual(false)
    expect(contractState.fields.admin).toEqual(testAddress)
  })

  it('test setBorrowRate success', async () => {
    console.log(testParamsFixture)
    const testParams = {
      ...testParamsFixture,
      initialFields: {
        ...testParamsFixture.initialFields
      },
      args: { newBorrowRate: 50000000000000000n }
    }

    const testResult = await FixedRate.tests.setBorrowRate(testParams)

    expect(testResult.returns).toEqual(null)

    // Verify contract state was updated
    const contractState = testResult.contracts[0] as FixedRateTypes.State
    expect(contractState.fields.rate).toEqual(50000000000000000n)
    expect(contractState.fields.rateUpdated).toEqual(true)
    expect(contractState.fields.admin).toEqual(testAddress)

    // Verify a RateSet event was emitted
    expect(testResult.events.length).toEqual(1)
    const event = testResult.events[0] as FixedRateTypes.RateSetEvent
    expect(event.name).toEqual('RateSet')
    expect(event.fields.setter).toEqual(testAddress)
    expect(event.fields.oldRate).toEqual(50000000000000000n)
    expect(event.fields.newRate).toEqual(50000000000000000n)
  })

  it('test setBorrowRate fails when already updated', async () => {
    const testParams = {
      ...testParamsFixture,
      initialFields: {
        ...testParamsFixture.initialFields,
        rateUpdated: true // Already updated
      },
      args: { newBorrowRate: 70000000000000000n }
    }

    expectAssertionError(
      FixedRate.tests.setBorrowRate(testParams),
      testParamsFixture.contractAddress!,
      Number(FixedRate.consts.ErrorCodes.RateAlreadySet)
    )
  })

  it('test setBorrowRate fails when rate is too high', async () => {
    const testParams = {
      ...testParamsFixture,
      args: { newBorrowRate: 100000000000000000001n } // > MAX_BORROW_RATE (1e20)
    }

    expectAssertionError(
      FixedRate.tests.setBorrowRate(testParams),
      testParamsFixture.contractAddress!,
      Number(FixedRate.consts.ErrorCodes.InvalidRate)
    )
  })

  it('test setBorrowRate fails when caller is not admin', async () => {
    const notOwner = await getSigner(10n * ONE_ALPH)

    const testParams = {
      ...testParamsFixture,
      inputAssets: [{ address: notOwner.address, asset: { alphAmount: 10n ** 18n } }]
    }

    expectAssertionError(
      FixedRate.tests.setBorrowRate(testParams),
      testParamsFixture.contractAddress!,
      Number(FixedRate.consts.ErrorCodes.NotAuthorized)
    )
  })

  it('test borrowRate returns fixed rate regardless of market conditions', async () => {
    const testParams = {
      ...testParamsFixture,
      args: {
        marketParams: {
          loanToken: testContractId,
          collateralToken: testContractId,
          oracle: testContractId,
          interestRateModel: testContractId,
          loanToValue: 75n * 10n ** 16n
        },
        marketState: {
          totalSupplyAssets: 1000000000000000000000n,
          totalSupplyShares: 2000000000000000000000n,
          totalBorrowAssets: 1000000000000000000000n,
          totalBorrowShares: 2000000000000000000000n,
          lastUpdate: 1000000000000000000000n,
          fee: 1000000000000000000000n
        }
      }
    }

    const testResult = await FixedRate.tests.borrowRate(testParams)

    // Check that it returns the fixed rate regardless of market conditions
    expect(testResult.returns).toEqual(100000000000000000n)
  })
})
