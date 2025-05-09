import { web3, DUST_AMOUNT } from '@alephium/web3'
import { testNodeWallet } from '@alephium/web3-test'
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
            const testAddress = account.address
            await signer.setSelectedAccount(testAddress)
            const testGroup = account.group

            const dynamicRate = deployments.getInstance(DynamicRate, testGroup)
            if (dynamicRate === undefined) {
                console.log(`The contract is not deployed on group ${account.group}`)
                continue
            }

            expect(dynamicRate.groupIndex).toEqual(testGroup)
            const initialState = await dynamicRate.fetchState()

            // Test transfer admin 
            const newAdmin = testAddress // Using same address for simplicity
            await dynamicRate.transact.transferAdmin({
                signer: signer,
                attoAlphAmount: DUST_AMOUNT * 3n,
                args: { newAdmin }
            })

            // Verify admin was updated
            const updatedState = await dynamicRate.fetchState()
            expect(updatedState.fields.admin).toEqual(newAdmin)

            // Test borrowRate and borrowRateView with mock market data
            const marketParams = {
                loanToken: testAddress,
                collateralToken: testAddress,
                oracle: testAddress
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
            const utilization = Number(marketState.totalBorrowAssets) / Number(marketState.totalSupplyAssets);
            console.log(`Utilization: ${utilization * 100}%`);

            // Get initial rate at target
            const rateAtTarget = await dynamicRate.view.getRateAtTarget({
                args: { loanToken: testAddress, collateralToken: testAddress }
            });

            // Should be 0 for first interaction
            expect(rateAtTarget.returns).toEqual(0n);
            console.log('Initial rate at target:', rateAtTarget.returns.toString());

            // Calculate expected rate using our calculation function (first interaction)
            const expectedRate = calculateBorrowRate(marketState, rateAtTarget.returns);
            console.log("Expected calculated rate:", expectedRate.toString());

            // Get borrow rate from contract
            const viewResult = await dynamicRate.view.borrowRate({
                args: { marketParams, marketState }
            });
            console.log("Actual contract rate:", viewResult.returns.toString());

            // Verify our calculation exactly matches the contract's result
            expect(viewResult.returns).toEqual(expectedRate);

            // Test rate update via transaction
            const borrowRate = await dynamicRate.transact.getBorrowRateAndUpdate({
                signer: signer,
                attoAlphAmount: DUST_AMOUNT * 100n,
                args: { marketParams, marketState }
            });

            // Verify rate was updated
            const newRateAtTarget = await dynamicRate.view.getRateAtTarget({
                args: { loanToken: marketParams.loanToken, collateralToken: marketParams.collateralToken }
            });
            console.log("New rate at target:", newRateAtTarget.returns.toString());

            // Rate at target should now be set
            expect(newRateAtTarget.returns).toBeGreaterThan(0n);

            // 2. Test with 90% utilization (at target)
            const targetUtilizationMarketState = {
                ...marketState,
                totalBorrowAssets: 27n * 10n ** 17n, // 2.7 tokens (90% utilization - at target)
                totalBorrowShares: 27n * 10n ** 17n
            };

            // Calculate expected rate at target utilization
            const expectedTargetRate = calculateBorrowRate(targetUtilizationMarketState, newRateAtTarget.returns);
            console.log("Expected target utilization rate:", expectedTargetRate.toString());

            const targetUtilizationResult = await dynamicRate.view.borrowRate({
                args: { marketParams, marketState: targetUtilizationMarketState }
            });
            console.log("Actual target utilization rate:", targetUtilizationResult.returns.toString());

            // Verify exact match for target utilization
            expect(targetUtilizationResult.returns).toEqual(expectedTargetRate);

            // 3. Test with very high utilization (95%)
            const highUtilizationMarketState = {
                ...marketState,
                totalBorrowAssets: 285n * 10n ** 16n, // 2.85 tokens (95% utilization - above target)
                totalBorrowShares: 285n * 10n ** 16n
            };

            // Calculate expected rate at high utilization
            const expectedHighRate = calculateBorrowRate(highUtilizationMarketState, newRateAtTarget.returns);
            console.log("Expected high utilization rate:", expectedHighRate.toString());

            const highUtilizationResult = await dynamicRate.view.borrowRate({
                args: { marketParams, marketState: highUtilizationMarketState }
            });
            console.log("Actual high utilization rate:", highUtilizationResult.returns.toString());

            // Verify exact match for high utilization
            expect(highUtilizationResult.returns).toEqual(expectedHighRate);

            // Verify the rate behavior
            expect(highUtilizationResult.returns).toBeGreaterThan(targetUtilizationResult.returns);
        }
    })
}) 