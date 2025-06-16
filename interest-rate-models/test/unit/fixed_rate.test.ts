import { web3, TestContractParams, addressFromContractId, DUST_AMOUNT } from '@alephium/web3'
import { testAddress, expectAssertionError, testNodeWallet, randomContractId } from '@alephium/web3-test'
import { FixedRate, FixedRateTypes } from '../../artifacts/ts'
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals'
import { deployToDevnet } from '@alephium/cli'

describe('unit tests', () => {
    let testContractAddress: string
    let testParamsFixture: TestContractParams<FixedRateTypes.Fields, { newBorrowRate: bigint }>
    let fixedRate: any
    let testContractId: string

    // We initialize the fixture variables before all tests
    beforeAll(async () => {
        web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)

        // Deploy the contract to devnet
        const deployments = await deployToDevnet()
        const signer = await testNodeWallet()
        const account = (await signer.getAccounts())[0]
        await signer.setSelectedAccount(account.address)
        const testGroup = account.group

        fixedRate = deployments.getInstance(FixedRate, testGroup)
        testContractAddress = fixedRate.address
        testContractId = randomContractId()

        testParamsFixture = {
            // Use the actual deployed contract address
            address: testContractAddress,
            // assets owned by the test contract before a test
            initialAsset: { alphAmount: 10n ** 18n },
            // initial state of the test contract
            initialFields: {
                admin: testAddress,
                rate: 100000000000000000n, // 0.1 * 10^18 = 10% in Wei format
                rateUpdated: false
            },
            // arguments to test the target function of the test contract
            testArgs: { newBorrowRate: 50000000000000000n }, // 0.05 * 10^18 = 5%
            // assets owned by the caller of the function
            inputAssets: [{ address: testAddress, asset: { alphAmount: 10n ** 18n } }]
        }
    })

    // Reset the contract state before each test
    beforeEach(async () => {
        // Get current state
        const state = await fixedRate.fetchState()

        // If the rate has been updated, reset it by deploying a new instance
        if (state.fields.rateUpdated) {
            const deployments = await deployToDevnet()
            const signer = await testNodeWallet()
            const account = (await signer.getAccounts())[0]
            await signer.setSelectedAccount(account.address)
            const testGroup = account.group

            fixedRate = deployments.getInstance(FixedRate, testGroup)
            testContractAddress = fixedRate.address

            // Update the testParamsFixture with the new address
            testParamsFixture.address = testContractAddress
        }
    })

    it('test getRate', async () => {
        const testParams = {
            ...testParamsFixture,
            testArgs: {}
        }

        const testResult = await FixedRate.tests.getRate(testParams)

        // Check the return value
        expect(testResult.returns).toEqual(100000000000000000n)

        // Verify contract state remains unchanged
        const contractState = testResult.contracts[0] as FixedRateTypes.State
        expect(contractState.fields.rate).toEqual(100000000000000000n)
        expect(contractState.fields.rateUpdated).toEqual(false)
        expect(contractState.fields.admin).toEqual(testAddress)
    })

    it('test setBorrowRate success', async () => {
        const testParams = {
            ...testParamsFixture,
            testArgs: { newBorrowRate: 50000000000000000n }
        }

        const testResult = await FixedRate.tests.setBorrowRate(testParams)

        // Check the return value
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
        // First set the rate to make rateUpdated true
        const initialParams = {
            ...testParamsFixture,
            testArgs: { newBorrowRate: 50000000000000000n }
        }
        await FixedRate.tests.setBorrowRate(initialParams)

        // Now try to set it again
        const testParams = {
            ...testParamsFixture,
            initialFields: {
                ...testParamsFixture.initialFields,
                rateUpdated: true
            },
            testArgs: { newBorrowRate: 70000000000000000n }
        }

        // Test that assertion fails with the RateAlreadySet error code
        await expectAssertionError(
            FixedRate.tests.setBorrowRate(testParams),
            testContractAddress,
            Number(FixedRate.consts.ErrorCodes.RateAlreadySet)
        )
    })

    it('test setBorrowRate fails when rate is too high', async () => {
        const testParams = {
            ...testParamsFixture,
            testArgs: { newBorrowRate: 100000000000000000001n } // > MAX_BORROW_RATE (1e20)
        }

        // Test that assertion fails with the InvalidRate error code
        await expectAssertionError(
            FixedRate.tests.setBorrowRate(testParams),
            testContractAddress,
            Number(FixedRate.consts.ErrorCodes.InvalidRate)
        )
    })

    it('test setBorrowRate fails when caller is not admin', async () => {
        // Create a signer with a different address
        const signer = await testNodeWallet()
        const accounts = await signer.getAccounts()
        // Find an account different from the admin
        const notAdminAccount = accounts.find(acc => acc.address !== testAddress) || accounts[1]
        const notAdmin = notAdminAccount.address

        const testParams = {
            ...testParamsFixture,
            inputAssets: [{ address: notAdmin, asset: { alphAmount: 10n ** 18n } }]
        }

        // Test that assertion fails with the NotAdmin error code
        await expectAssertionError(
            FixedRate.tests.setBorrowRate(testParams),
            testContractAddress,
            Number(FixedRate.consts.ErrorCodes.NotAuthorized)
        )
    })

    it('test borrowRate returns fixed rate regardless of market conditions', async () => {
        const testParams = {
            ...testParamsFixture,
            testArgs: {
                marketParams: { loanToken: testContractId, collateralToken: testContractId, oracle: testContractId, interestRateModel: testContractId, loanToValue: 75n * 10n ** 16n },
                marketState: { totalSupplyAssets: 1000000000000000000000n, totalSupplyShares: 2000000000000000000000n, totalBorrowAssets: 1000000000000000000000n, totalBorrowShares: 2000000000000000000000n, lastUpdate: 1000000000000000000000n, fee: 1000000000000000000000n }
            }
        }

        const testResult = await FixedRate.tests.borrowRate(testParams)

        // Check that it returns the fixed rate regardless of market conditions
        expect(testResult.returns).toEqual(100000000000000000n)
    })
}) 