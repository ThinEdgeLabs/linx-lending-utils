import { web3, TestContractParams, addressFromContractId } from '@alephium/web3'
import { randomContractId, testAddress } from '@alephium/web3-test'
import { DynamicRate, DynamicRateTypes } from '../../artifacts/ts'
import { describe, it, expect, beforeAll, jest } from '@jest/globals'

// Increase timeout for all tests in this file
jest.setTimeout(15000)

// Testing the utility functions through DynamicRate which extends CurveUtils
describe('curve utils unit tests', () => {
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

  it('test wadMul function', async () => {
    const testParams = {
      ...testParamsFixture,
      args: {
        a: 2n * 10n ** 18n, // 2.0 in WAD format
        b: 3n * 10n ** 18n // 3.0 in WAD format
      }
    }

    const testResult = await DynamicRate.tests.wadMul(testParams)

    // 2.0 * 3.0 = 6.0
    expect(testResult.returns).toEqual(6n * 10n ** 18n)
  })

  it('test wadMul with fractional values', async () => {
    const testParams = {
      ...testParamsFixture,
      args: {
        a: 5n * 10n ** 17n, // 0.5 in WAD format
        b: 2n * 10n ** 17n // 0.2 in WAD format
      }
    }

    const testResult = await DynamicRate.tests.wadMul(testParams)

    // 0.5 * 0.2 = 0.1
    expect(testResult.returns).toEqual(1n * 10n ** 17n)
  })

  it('test wadDiv function', async () => {
    const testParams = {
      ...testParamsFixture,
      args: {
        a: 6n * 10n ** 18n, // 6.0 in WAD format
        b: 3n * 10n ** 18n // 3.0 in WAD format
      }
    }

    const testResult = await DynamicRate.tests.wadDiv(testParams)

    // 6.0 / 3.0 = 2.0
    expect(testResult.returns).toEqual(2n * 10n ** 18n)
  })

  it('test wadDiv with zero divisor', async () => {
    const testParams = {
      ...testParamsFixture,
      args: {
        a: 6n * 10n ** 18n, // 6.0 in WAD format
        b: 0n // divide by zero
      }
    }

    const testResult = await DynamicRate.tests.wadDiv(testParams)

    // Division by zero should return 0
    expect(testResult.returns).toEqual(0n)
  })

  it('test wadDiv with fractional values', async () => {
    const testParams = {
      ...testParamsFixture,
      args: {
        a: 1n * 10n ** 18n, // 1.0 in WAD format
        b: 2n * 10n ** 18n // 2.0 in WAD format
      }
    }

    const testResult = await DynamicRate.tests.wadDiv(testParams)

    // 1.0 / 2.0 = 0.5
    expect(testResult.returns).toEqual(5n * 10n ** 17n)
  })

  it('test wadExp function with zero', async () => {
    const testParams = {
      ...testParamsFixture,
      args: {
        x: 0n // e^0 = 1
      }
    }

    const testResult = await DynamicRate.tests.wadExp(testParams)

    // e^0 = 1.0
    expect(testResult.returns).toEqual(1n * 10n ** 18n)
  })

  it('test wadExp function with small value', async () => {
    const testParams = {
      ...testParamsFixture,
      args: {
        x: 1n * 10n ** 17n // e^0.1 ≈ 1.105...
      }
    }

    const testResult = await DynamicRate.tests.wadExp(testParams)

    // Test that the result is approximately correct
    // We don't check for exact equality since the implementation uses an approximation
    expect(testResult.returns > 1n * 10n ** 18n).toBeTruthy()
    expect(testResult.returns < 12n * 10n ** 17n).toBeTruthy()
  })

  it('test newRateAtTarget function with bounds', async () => {
    // Test min bound
    const testParamsMin = {
      ...testParamsFixture,
      args: {
        startRateAtTarget: 1n * 10n ** 15n, // 0.1% annual rate (not per-second MIN_RATE_AT_TARGET)
        linearAdaptation: -1n * 10n ** 20n // large negative adaptation
      }
    }

    const testResultMin = await DynamicRate.tests.newRateAtTarget(testParamsMin)

    // Result shouldn't be less than MIN_RATE_AT_TARGET
    expect(testResultMin.returns).toEqual(31709791n) // MIN_RATE_AT_TARGET (1e15i / 31536000i)

    // Test max bound
    const testParamsMax = {
      ...testParamsFixture,
      args: {
        startRateAtTarget: 3n * 10n ** 17n, // 30% annual rate (not per-second MAX_RATE_AT_TARGET)
        linearAdaptation: 1n * 10n ** 20n // large positive adaptation
      }
    }

    const testResultMax = await DynamicRate.tests.newRateAtTarget(testParamsMax)

    // Result shouldn't be more than MAX_RATE_AT_TARGET
    expect(testResultMax.returns).toEqual(63419583967n) // MAX_RATE_AT_TARGET (2e18i / 31536000i)
  })

  it('test applyCurve function with positive error', async () => {
    const testParams = {
      ...testParamsFixture,
      args: {
        rateAtTarget_: 1n * 10n ** 16n, // 1% rate at target
        err: 2n * 10n ** 17n // positive error (0.2)
      }
    }

    const testResult = await DynamicRate.tests.applyCurve(testParams)

    // Rate should increase with positive error
    expect(testResult.returns > 1n * 10n ** 16n).toBeTruthy()
  })

  it('test applyCurve function with negative error', async () => {
    const testParams = {
      ...testParamsFixture,
      args: {
        rateAtTarget_: 1n * 10n ** 16n, // 1% rate at target
        err: -2n * 10n ** 17n // negative error (-0.2)
      }
    }

    const testResult = await DynamicRate.tests.applyCurve(testParams)

    // Rate should decrease with negative error
    expect(testResult.returns < 1n * 10n ** 16n).toBeTruthy()
  })

  it('test applyCurve function with zero error', async () => {
    const testParams = {
      ...testParamsFixture,
      args: {
        rateAtTarget_: 1n * 10n ** 16n, // 1% rate at target
        err: 0n // zero error
      }
    }

    const testResult = await DynamicRate.tests.applyCurve(testParams)

    // Rate should be unchanged with zero error
    expect(testResult.returns).toEqual(1n * 10n ** 16n)
  })
})
