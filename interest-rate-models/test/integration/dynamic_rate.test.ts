import { web3, DUST_AMOUNT, groupOfAddress } from '@alephium/web3'
import { testNodeWallet, randomContractId } from '@alephium/web3-test'
import { deployToDevnet } from '@alephium/cli'
import { DynamicRate } from '../../artifacts/ts'
import { describe, it, expect, beforeAll, jest } from '@jest/globals'
import { calculateBorrowRate } from '../utils/rate_calculations'

// Increase timeout for all tests in this file
jest.setTimeout(30000)

describe('dynamic rate integration tests', () => {
  beforeAll(async () => {
    web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)
  })

  it('should test dynamic rate functions on devnet', async () => {
    const signer = await testNodeWallet()
    const deployments = await deployToDevnet()

    // Test with all of the addresses of the wallet
    for (const account of await signer.getAccounts()) {
      const testAddress = randomContractId()
      await signer.setSelectedAccount(account.address)
      const testGroup = groupOfAddress(account.address)

      const dynamicRate = deployments.getInstance(DynamicRate, testGroup)
      if (dynamicRate === undefined) {
        console.log(`The contract is not deployed on group ${testGroup}`)
        continue
      }

      expect(dynamicRate.groupIndex).toEqual(testGroup)

      // Test borrowRate and borrowRateView with mock market data
      const marketParams = {
        loanToken: testAddress,
        collateralToken: testAddress,
        oracle: testAddress,
        interestRateModel: testAddress,
        loanToValue: 75n * 10n ** 16n
      }

      const marketState = {
        totalSupplyAssets: 3n * 10n ** 18n, // 3 tokens
        totalSupplyShares: 3n * 10n ** 18n,
        totalBorrowAssets: 15n * 10n ** 17n, // 1.5 tokens (50% utilization)
        totalBorrowShares: 15n * 10n ** 17n,
        lastUpdate: 1000n,
        fee: 0n
      }

      // 1. Test initial rate calculation with 50% utilization
      // Calculate utilization and expected rate
      const utilization = Number(marketState.totalBorrowAssets) / Number(marketState.totalSupplyAssets)
      console.log(`Utilization: ${utilization * 100}%`)

      // Get initial rate at target
      const rateAtTarget = await dynamicRate.view.getRateAtTarget({
        args: { loanToken: testAddress, collateralToken: testAddress }
      })

      // Should be 0 for first interaction
      expect(rateAtTarget.returns).toEqual(0n)
      console.log('Initial rate at target:', rateAtTarget.returns.toString())

      // Calculate expected rate using our calculation function (first interaction)
      const expectedRate = calculateBorrowRate(marketState, rateAtTarget.returns)
      console.log('Expected calculated rate:', expectedRate.toString())

      // Get borrow rate from contract
      const viewResult = await dynamicRate.view.borrowRateView({
        args: { marketParams, marketState }
      })
      console.log('Actual contract rate:', viewResult.returns.toString())

      // Verify our calculation exactly matches the contract's result
      expect(viewResult.returns).toEqual(expectedRate)

      // Test rate update via transaction
      await dynamicRate.transact.borrowRate({
        signer: signer,
        attoAlphAmount: DUST_AMOUNT * 100n,
        args: { marketParams, marketState }
      })

      // Verify rate was updated
      const newRateAtTarget = await dynamicRate.view.getRateAtTarget({
        args: { loanToken: marketParams.loanToken, collateralToken: marketParams.collateralToken }
      })
      console.log('New rate at target:', newRateAtTarget.returns.toString())

      // Rate at target should now be set
      expect(newRateAtTarget.returns).toBeGreaterThan(0n)

      // 2. Test with 90% utilization (at target)
      const targetUtilizationMarketState = {
        ...marketState,
        totalBorrowAssets: 27n * 10n ** 17n, // 2.7 tokens (90% utilization - at target)
        totalBorrowShares: 27n * 10n ** 17n
      }

      // Calculate expected rate at target utilization
      const expectedTargetRate = calculateBorrowRate(targetUtilizationMarketState, newRateAtTarget.returns)
      console.log('Expected target utilization rate:', expectedTargetRate.toString())

      const targetUtilizationResult = await dynamicRate.view.borrowRateView({
        args: { marketParams, marketState: targetUtilizationMarketState }
      })
      console.log('Actual target utilization rate:', targetUtilizationResult.returns.toString())

      // Verify exact match for target utilization
      expect(targetUtilizationResult.returns).toEqual(expectedTargetRate)

      // 3. Test with very high utilization (95%)
      const highUtilizationMarketState = {
        ...marketState,
        totalBorrowAssets: 285n * 10n ** 16n, // 2.85 tokens (95% utilization - above target)
        totalBorrowShares: 285n * 10n ** 16n
      }

      // Calculate expected rate at high utilization
      const expectedHighRate = calculateBorrowRate(highUtilizationMarketState, newRateAtTarget.returns)
      console.log('Expected high utilization rate:', expectedHighRate.toString())

      const highUtilizationResult = await dynamicRate.view.borrowRateView({
        args: { marketParams, marketState: highUtilizationMarketState }
      })
      console.log('Actual high utilization rate:', highUtilizationResult.returns.toString())

      // Verify exact match for high utilization
      expect(highUtilizationResult.returns).toEqual(expectedHighRate)

      // Verify the rate behavior
      expect(highUtilizationResult.returns).toBeGreaterThan(targetUtilizationResult.returns)

      // 4. Edge case: zero utilization (0%)
      const zeroUtilizationMarketState = {
        ...marketState,
        totalBorrowAssets: 0n,
        totalBorrowShares: 0n
      }

      const expectedZeroRate = calculateBorrowRate(zeroUtilizationMarketState, newRateAtTarget.returns)
      const zeroUtilizationResult = await dynamicRate.view.borrowRateView({
        args: { marketParams, marketState: zeroUtilizationMarketState }
      })

      // Exact match with our calculation
      expect(zeroUtilizationResult.returns).toEqual(expectedZeroRate)
      // Rate at zero utilization should be below the target-utilization rate
      expect(zeroUtilizationResult.returns).toBeLessThan(targetUtilizationResult.returns)

      // 5. over-utilization (> 100%, e.g. 150%)
      const overUtilizationMarketState = {
        ...marketState,
        totalBorrowAssets: 45n * 10n ** 17n, // 4.5 tokens → 150% utilization
        totalBorrowShares: 45n * 10n ** 17n
      }

      const expectedOverRate = calculateBorrowRate(overUtilizationMarketState, newRateAtTarget.returns)
      const overUtilizationResult = await dynamicRate.view.borrowRateView({
        args: { marketParams, marketState: overUtilizationMarketState }
      })

      expect(overUtilizationResult.returns).toEqual(expectedOverRate)
      // The rate for >100% utilization should exceed the 95% utilization rate
      expect(overUtilizationResult.returns).toBeGreaterThan(highUtilizationResult.returns)

      // 6. Time-dependent adaptation checks
      const ONE_YEAR = 31536000n // seconds

      // For utilization ABOVE target (95%) the borrow‐rate should INCREASE with time
      const highUtilRecent = {
        ...highUtilizationMarketState,
        lastUpdate: highUtilizationMarketState.lastUpdate + ONE_YEAR // simulate an update 1 year later (smaller elapsed)
      }
      const highUtilOld = {
        ...highUtilizationMarketState,
        lastUpdate: highUtilizationMarketState.lastUpdate // older (baseline)
      }

      const recentHighRate = await dynamicRate.view.borrowRateView({
        args: { marketParams, marketState: highUtilRecent }
      })
      const oldHighRate = await dynamicRate.view.borrowRateView({
        args: { marketParams, marketState: highUtilOld }
      })

      // When utilization is above target, the rate should grow over time
      expect(oldHighRate.returns).toBeGreaterThanOrEqual(recentHighRate.returns)

      // For utilization BELOW target (50%) the borrow-rate should DECREASE with time
      const lowUtilRecent = {
        ...marketState,
        lastUpdate: marketState.lastUpdate + ONE_YEAR // 1 year more recent (smaller elapsed)
      }
      const lowUtilOld = {
        ...marketState,
        lastUpdate: marketState.lastUpdate // baseline (older)
      }

      const recentLowRate = await dynamicRate.view.borrowRateView({
        args: { marketParams, marketState: lowUtilRecent }
      })
      const oldLowRate = await dynamicRate.view.borrowRateView({
        args: { marketParams, marketState: lowUtilOld }
      })

      // When utilization is below target, the rate should decay over time
      expect(oldLowRate.returns).toBeLessThanOrEqual(recentLowRate.returns)
    }
  })
})
