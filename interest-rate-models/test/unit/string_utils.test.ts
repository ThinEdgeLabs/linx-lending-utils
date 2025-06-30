import { web3, TestContractParams, addressFromContractId } from '@alephium/web3'
import { randomContractId, testAddress } from '@alephium/web3-test'
import { DynamicRate, DynamicRateTypes } from '../../artifacts/ts'
import { describe, it, expect, beforeAll } from '@jest/globals'

// Testing the StringUtils functions through DynamicRate which extends StringUtils
describe('string utils unit tests', () => {
  let testContractId: string
  let testContractAddress: string
  let testParamsFixture: TestContractParams<DynamicRateTypes.Fields, {}>
  let linxAddress: string

  // We initialize the fixture variables before all tests
  beforeAll(async () => {
    web3.setCurrentNodeProvider('https://node.testnet.alephium.org', undefined, fetch)
    testContractId = randomContractId()
    testContractAddress = addressFromContractId(testContractId)
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

    const testParams = {
      ...testParamsFixture,
      args: {
        loanToken,
        collateralToken
      }
    }

    const testResult = await DynamicRate.tests.calcMarketId(testParams)

    // The ID should be a ByteVec value (not null or empty)
    expect(testResult.returns).toBeDefined()

    // Generate a second ID with different marketParams
    const newLoanToken = addressFromContractId(randomContractId())
    const testParams2 = {
      ...testParamsFixture,
      args: {
        loanToken: newLoanToken,
        collateralToken
      }
    }

    const testResult2 = await DynamicRate.tests.calcMarketId(testParams2)

    // Different loan tokens should generate different IDs
    expect(testResult.returns).not.toEqual(testResult2.returns)

    // Test same parameters produce the same ID (consistency)
    const testParams3 = {
      ...testParamsFixture,
      args: {
        loanToken,
        collateralToken
      }
    }

    const testResult3 = await DynamicRate.tests.calcMarketId(testParams3)

    // Same parameters should generate the same ID
    expect(testResult.returns).toEqual(testResult3.returns)
  })
})
