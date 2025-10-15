import { web3, TestContractParams, addressFromContractId, NamedVals } from '@alephium/web3'
import { randomContractId, testAddress } from '@alephium/web3-test'
import { DynamicRate, DynamicRateTypes } from '../../artifacts/ts'
import { describe, it, expect, beforeAll } from '@jest/globals'

// Testing the StringUtils functions through DynamicRate which extends StringUtils
describe('string utils unit tests', () => {
  let testParamsFixture: TestContractParams<DynamicRateTypes.Fields, NamedVals>
  let linxAddress: string

  // We initialize the fixture variables before all tests
  beforeAll(async () => {
    web3.setCurrentNodeProvider('https://node.testnet.alephium.org', undefined, fetch)
    linxAddress = addressFromContractId(randomContractId())
    testParamsFixture = {
      // Assets owned by the test contract before a test
      initialAsset: { alphAmount: 10n ** 18n },
      // Initial state of the test contract
      initialFields: {
        linx: linxAddress
      },
      // Assets owned by the caller of the function
      inputAssets: [{ address: testAddress, asset: { alphAmount: 10n ** 18n } }],
      // Empty test args will be overridden in each test
      args: {}
    }
  })

  it('test calcMarketId function', async () => {
    // Create addresses for testing
    const loanToken = addressFromContractId(randomContractId())
    const collateralToken = addressFromContractId(randomContractId())
    const irm = addressFromContractId(randomContractId())
    const oracle = addressFromContractId(randomContractId())
    const loanToValue = 50n

    const marketParams = {
      loanToken,
      collateralToken,
      interestRateModel: irm,
      oracle,
      loanToValue
    }

    const testParams = {
      ...testParamsFixture,
      args: {
        params: marketParams
      }
    }

    const testResult = await DynamicRate.tests.calcMarketId(testParams)

    // The ID should be a ByteVec value (not null or empty)
    expect(testResult.returns).toBeDefined()

    // Generate a second ID with different marketParams
    const newLoanToken = addressFromContractId(randomContractId())
    const marketParams2 = {
      ...marketParams,
      loanToken: newLoanToken
    }
    const testParams2 = {
      ...testParamsFixture,
      args: {
        params: marketParams2
      }
    }

    const testResult2 = await DynamicRate.tests.calcMarketId(testParams2)

    // Different loan tokens should generate different IDs
    expect(testResult.returns).not.toEqual(testResult2.returns)
  })
})
