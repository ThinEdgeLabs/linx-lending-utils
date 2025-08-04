import { web3, DUST_AMOUNT, groupOfAddress, addressFromContractId } from '@alephium/web3'
import { expectAssertionError, testNodeWallet } from '@alephium/web3-test'
import { FixedRate } from '../../artifacts/ts'
import { describe, it, expect, beforeAll } from '@jest/globals'

async function deployFixedRate(signer) {
  const address = (await signer.getSelectedAccount()).address
  const result = await FixedRate.deploy(signer, {
    initialFields: {
      rate: 50000000000000000n, // 5% (0.05 * 10^18)
      admin: address,
      rateUpdated: true
    }
  })
  console.log(`FixedRate deployed at: ${result.contractInstance.contractId}`)
  console.log(`Contract address: ${result.contractInstance.address}`)
  return result.contractInstance.contractId
}

describe('integration tests', () => {
  let fixedRateId: string

  beforeAll(async () => {
    web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)
  })

  it('should test fixed rate functions on devnet', async () => {
    const signer = await testNodeWallet()
    fixedRateId = await deployFixedRate(signer)
    const account = await signer.getSelectedAccount()
    const testAddress = account.address
    await signer.setSelectedAccount(testAddress)
    const testGroup = groupOfAddress(testAddress)

    const fixedRate = FixedRate.at(addressFromContractId(fixedRateId))

    expect(fixedRate.groupIndex).toEqual(testGroup)
    const initialState = await fixedRate.fetchState()

    // Test setBorrowRate function with a new rate
    // Only execute this if rateUpdated is false
    if (!initialState.fields.rateUpdated) {
      const newRate = 10000000000000000n // 0.01 * 10^18 = 1% in Wei format

      await fixedRate.transact.setBorrowRate({
        signer: signer,
        attoAlphAmount: DUST_AMOUNT * 3n,
        args: { newBorrowRate: newRate }
      })

      // Verify the rate was updated
      const updatedState = await fixedRate.fetchState()
      expect(updatedState.fields.rate).toEqual(newRate)
      expect(updatedState.fields.rateUpdated).toEqual(true)

      // Verify that attempt to set rate again fails (as rateUpdated is now true)
      await expectAssertionError(
        fixedRate.transact.setBorrowRate({
          signer: signer,
          attoAlphAmount: DUST_AMOUNT * 3n,
          args: { newBorrowRate: newRate * 2n }
        }),
        fixedRate.address,
        Number(FixedRate.consts.ErrorCodes.RateAlreadySet)
      )
    }
  }, 20000)
})
