import { web3, TestContractParams, addressFromContractId, DUST_AMOUNT } from '@alephium/web3'
import { testAddress, expectAssertionError, testNodeWallet } from '@alephium/web3-test'
import { DynamicRate, DynamicRateTypes } from '../../artifacts/ts'
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals'
import { deployToDevnet } from '@alephium/cli'
import { randomContractId } from '@alephium/web3-test'

describe('dynamic rate unit tests', () => {
    let testContractAddress: string
    let testParamsFixture: TestContractParams<DynamicRateTypes.Fields, {}>
    let dynamicRate: any
    let linxAddress: string

    // We initialize the fixture variables before all tests
    beforeAll(async () => {
        web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)

        // Deploy the contract to devnet
        const deployments = await deployToDevnet()
        const signer = await testNodeWallet()
        const accounts = await signer.getAccounts()
        const account = accounts[0]
        await signer.setSelectedAccount(account.address)
        const testGroup = account.group
        linxAddress = account.address

        dynamicRate = deployments.getInstance(DynamicRate, testGroup)
        testContractAddress = dynamicRate.address

        testParamsFixture = {
            // Contract address
            address: testContractAddress,
            // Assets owned by the test contract before a test
            initialAsset: { alphAmount: 10n ** 18n },
            // Initial state of the test contract
            initialFields: {
                linx: linxAddress,
                admin: account.address
            },
            // Assets owned by the caller of the function
            inputAssets: [{ address: linxAddress, asset: { alphAmount: 10n ** 18n } }],
            // Empty test args will be overridden in each test
            testArgs: {}
        }
    })


    it('test borrowRateView for first interaction', async () => {
        const marketParams = {
            loanToken: testAddress,
            collateralToken: testAddress,
            oracle: testAddress
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
            testArgs: {
                marketParams,
                marketState
            }
        }

        const testResult = await DynamicRate.tests.borrowRate(testParams)
        console.log('testResult', testResult)

        // For first interaction, should return the initial rate at target
        // with appropriate curve adjustment based on utilization
        expect(testResult.returns).toBeDefined()
        expect(testResult.returns > 0n).toBeTruthy()
    })

    it('test borrowRate requires authorization', async () => {
        const marketParams = {
            loanToken: testAddress,
            collateralToken: testAddress,
            oracle: testAddress
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
        const unauthorizedAccount = accounts.find(acc => acc.address !== linxAddress) || accounts[0]
        const unauthorizedAddress = unauthorizedAccount.address

        const testParams = {
            ...testParamsFixture,
            inputAssets: [{ address: unauthorizedAddress, asset: { alphAmount: 10n ** 18n } }],
            testArgs: {
                marketParams,
                marketState
            }
        }

        await expectAssertionError(
            DynamicRate.tests.getBorrowRateAndUpdate(testParams),
            testContractAddress,
            Number(DynamicRate.consts.ErrorCodes.NotAuthorized)
        )
    })

    it('test borrowRate with successful update', async () => {
        const marketParams = {
            loanToken: testAddress,
            collateralToken: testAddress,
            oracle: testAddress
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
            testArgs: {
                marketParams,
                marketState
            }
        }

        const testResult = await DynamicRate.tests.getBorrowRateAndUpdateTest(testParams)

        // Check the return value
        expect(testResult.returns).toBeDefined()
        expect(testResult.returns > 0n).toBeTruthy()

        // Check that we've emitted a BorrowRateUpdate event
        expect(testResult.events.length).toEqual(1)
        const event = testResult.events[0] as DynamicRateTypes.BorrowRateUpdateEvent
        expect(event.name).toEqual('BorrowRateUpdate')
        expect(event.fields.avgBorrowRate).toEqual(testResult.returns)
    })

    it('test borrowRate with high utilization', async () => {
        const marketParams = {
            loanToken: testAddress,
            collateralToken: testAddress,
            oracle: testAddress
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
            testArgs: {
                marketParams,
                marketState
            }
        }

        const testResultHigh = await DynamicRate.tests.getBorrowRateAndUpdateTest(testParams)

        // Now test with lower utilization to compare
        const marketStateWithLowUtilization = {
            ...marketState,
            totalBorrowAssets: 50n * 10n ** 18n, // 50% utilization (below target)
        }

        const testParamsLow = {
            ...testParamsFixture,
            testArgs: {
                marketParams,
                marketState: marketStateWithLowUtilization
            }
        }

        const testResultLow = await DynamicRate.tests.getBorrowRateAndUpdateTest(testParamsLow)

        // High utilization should give higher rate
        expect(testResultHigh.returns > testResultLow.returns).toBeTruthy()
    })

    it('test borrowRate with zero supply assets', async () => {
        const marketParams = {
            loanToken: testAddress,
            collateralToken: testAddress,
            oracle: testAddress
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
            testArgs: {
                marketParams,
                marketState
            }
        }

        // Should not revert with division by zero
        const testResult = await DynamicRate.tests.getBorrowRateAndUpdateTest(testParams)
        expect(testResult.returns).toBeDefined()
    })

    it('test transferAdmin unauthorized', async () => {
        // Get an actual wallet address that's different from admin
        const signer = await testNodeWallet()
        const accounts = await signer.getAccounts()
        // Find an account different from admin
        const unauthorizedAccount = accounts.find(acc => acc.address !== testAddress) || accounts[0]
        const unauthorizedAddress = unauthorizedAccount.address

        const testParams = {
            ...testParamsFixture,
            inputAssets: [{ address: unauthorizedAddress, asset: { alphAmount: 10n ** 18n } }],
            testArgs: {
                newAdmin: unauthorizedAddress
            }
        }

        await expectAssertionError(
            DynamicRate.tests.transferAdmin(testParams),
            testContractAddress,
            Number(DynamicRate.consts.ErrorCodes.NotAuthorized)
        )
    })

    it('test transferAdmin success', async () => {
        const newAdmin = testAddress // Using same address for simplicity
        const testParams = {
            ...testParamsFixture,
            inputAssets: [{ address: testAddress, asset: { alphAmount: 10n ** 18n } }],
            testArgs: {
                newAdmin
            }
        }

        const testResult = await DynamicRate.tests.transferAdmin(testParams)

        // Verify admin was updated
        const contractState = testResult.contracts[0] as DynamicRateTypes.State
        expect(contractState.fields.admin).toEqual(newAdmin)

        // Check that we've emitted an AdminTransferred event
        expect(testResult.events.length).toEqual(1)
        const event = testResult.events[0] as any // Use 'any' instead of specific type since we're not sure of the exact type
        expect(event.name).toEqual('AdminTransferred')
        expect(event.fields.oldAdmin).toEqual(testAddress)
        expect(event.fields.newAdmin).toEqual(newAdmin)
    })

    it('test rate adjustment over time', async () => {
        const marketParams = {
            loanToken: testAddress,
            collateralToken: testAddress,
            oracle: testAddress
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
            testArgs: {
                marketParams,
                marketState
            }
        }

        const initialResult = await DynamicRate.tests.getBorrowRateAndUpdateTest(initialTestParams)

        // Now simulate passage of time and changed utilization
        const laterMarketState = {
            ...marketState,
            totalBorrowAssets: 90n * 10n ** 18n, // 90% utilization (above target)
            lastUpdate: 110000n // 10,000 units of time later
        }

        const laterTestParams = {
            ...testParamsFixture,
            testArgs: {
                marketParams,
                marketState: laterMarketState
            }
        }

        const laterResult = await DynamicRate.tests.getBorrowRateAndUpdateTest(laterTestParams)

        // Rates should adjust over time, with higher utilization leading to higher rates
        expect(laterResult.returns > initialResult.returns).toBeTruthy()
    })
}) 