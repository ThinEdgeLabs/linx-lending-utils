import {
  web3,
  SignerProvider,
  addressFromContractId,
  MAP_ENTRY_DEPOSIT,
  waitForTxConfirmation,
  prettifyTokenAmount
} from '@alephium/web3'
import { testNodeWallet, randomContractId } from '@alephium/web3-test'
import { DynamicRate, DynamicRateInstance } from '../../artifacts/ts'
import { describe, it, expect, beforeAll, jest } from '@jest/globals'
import { MarketParams, MarketState } from '../../artifacts/ts/types'
import { _err, applyCurve } from '../utils/rate_calculations'

jest.setTimeout(300000)

function calculateAPY(ratePerSecond: bigint): string | undefined {
  const secondsInYear = 31536000
  return prettifyTokenAmount(ratePerSecond * BigInt(secondsInYear), 16) + '%'
}

function assertApproxEqual(actual: bigint, expected: bigint, toleranceBps: number = 100) {
  const tolerance = (expected * BigInt(toleranceBps)) / 10000n
  const lowerBound = expected - tolerance
  const upperBound = expected + tolerance

  if (actual < lowerBound || actual > upperBound) {
    throw new Error(
      `Values are not approximately equal. Actual: ${actual}, Expected: ${expected}, Tolerance: ±${tolerance} (${toleranceBps} bps)`
    )
  }
}

async function deployDynamicRate(signer: SignerProvider): Promise<string> {
  const address = (await signer.getSelectedAccount()).address
  const result = await DynamicRate.deploy(signer, {
    initialFields: {
      linx: address
    }
  })
  console.log(`DynamicRate deployed at: ${result.contractInstance.contractId}`)
  console.log(`Contract address: ${result.contractInstance.address}`)
  return result.contractInstance.contractId
}

async function testFirstInteraction(params: {
  suppliedAssets: bigint
  borrowedAssets: bigint
  expectedAvgRate: bigint
  expectedRateAtTarget: bigint
  marketParams: MarketParams
  signer?: SignerProvider
}): Promise<DynamicRateInstance> {
  const { suppliedAssets, borrowedAssets, expectedAvgRate, expectedRateAtTarget, marketParams } = params
  const signer: SignerProvider = params.signer ?? (await testNodeWallet())
  const dynamicRateId = await deployDynamicRate(signer)
  const dynamicRate = DynamicRate.at(addressFromContractId(dynamicRateId))
  const marketState = {
    totalSupplyAssets: suppliedAssets,
    totalSupplyShares: 0n,
    totalBorrowAssets: borrowedAssets,
    totalBorrowShares: 0n,
    lastUpdate: BigInt(Date.now()),
    fee: 0n
  }

  await dynamicRate.transact.initInterest({
    args: { marketParams, marketState },
    signer: signer,
    attoAlphAmount: MAP_ENTRY_DEPOSIT
  })

  const txResult = await dynamicRate.transact.borrowRate({
    signer: signer,
    args: { marketParams, marketState }
  })
  await waitForTxConfirmation(txResult.txId, 1, 2)

  const { events } = await signer.nodeProvider!.events.getEventsContractContractaddress(dynamicRate.address, {
    start: 0
  })

  expect(events[0].eventIndex).toEqual(0)

  const avgRate = BigInt(events[0].fields[1].value as string)
  expect(avgRate).toEqual(expectedAvgRate)

  const rateAtTarget = BigInt(events[0].fields[2].value as string)
  expect(rateAtTarget).toEqual(expectedRateAtTarget)

  console.log(`Avg rate: ${calculateAPY(avgRate)}, Expected avg rate: ${calculateAPY(expectedAvgRate)}`)
  console.log(
    `Rate at target: ${calculateAPY(rateAtTarget)}, Expected rate at target: ${calculateAPY(expectedRateAtTarget)}`
  )

  return dynamicRate
}

async function updateBorrowRate(params: {
  dynamicRate: DynamicRateInstance
  signer: SignerProvider
  marketParams: MarketParams
  marketState: MarketState
}): Promise<[bigint, bigint]> {
  const { dynamicRate, signer, marketParams, marketState } = params
  const txResult = await dynamicRate.transact.borrowRate({
    signer: signer,
    args: { marketParams, marketState }
  })
  await waitForTxConfirmation(txResult.txId, 1, 2)

  const { events } = await signer.nodeProvider!.events.getEventsContractContractaddress(dynamicRate.address, {
    start: 0
  })

  const lastEventIndex = events.length - 1
  expect(events[lastEventIndex].eventIndex).toEqual(0)

  const avgRate = BigInt(events[lastEventIndex].fields[1].value as string)
  const rateAtTarget = BigInt(events[lastEventIndex].fields[2].value as string)
  return [avgRate, rateAtTarget]
}

describe('dynamic rate integration tests', () => {
  const ONE_YEAR_IN_SECONDS = 365n * 24n * 3600n
  const loanToken = randomContractId()
  const collateralToken = randomContractId()
  const oracle = randomContractId()
  const interestRateModel = randomContractId()
  const marketParams = {
    loanToken,
    collateralToken,
    oracle,
    interestRateModel,
    loanToValue: 86n * 10n ** 16n
  }

  beforeAll(async () => {
    web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)
  })

  it('returns the correct rate after 5 days with 100% utilization', async () => {
    const dynamicRate = await testFirstInteraction({
      suppliedAssets: 1n,
      borrowedAssets: 1n,
      expectedAvgRate: DynamicRate.consts.INITIAL_RATE_AT_TARGET * 4n,
      expectedRateAtTarget: DynamicRate.consts.INITIAL_RATE_AT_TARGET,
      marketParams
    })

    const marketState = {
      totalSupplyAssets: 1n,
      totalSupplyShares: 0n,
      totalBorrowAssets: 1n,
      totalBorrowShares: 0n,
      lastUpdate: BigInt(Date.now() - 5 * 24 * 3600 * 1000),
      fee: 0n
    }
    const result = await dynamicRate.view.borrowRateView({
      args: { marketParams, marketState }
    })
    const avgRate = result.returns
    const ONE_YEAR_IN_SECONDS = 365n * 24n * 3600n
    const expectedRate = BigInt(0.22976 * 10 ** 18) / ONE_YEAR_IN_SECONDS // ~22.976% APY

    console.log('Avg rate after 5 days at 100% utilization: ' + calculateAPY(avgRate))
    console.log('Expected rate after 5 days at 100% utilization: ' + calculateAPY(expectedRate))

    assertApproxEqual(avgRate, expectedRate, 1000) // 1000 bps tolerance
  })

  it('returns the correct rate after 5 days with 0% utilization', async () => {
    const dynamicRate = await testFirstInteraction({
      suppliedAssets: 0n,
      borrowedAssets: 0n,
      expectedAvgRate: DynamicRate.consts.INITIAL_RATE_AT_TARGET / 4n,
      expectedRateAtTarget: DynamicRate.consts.INITIAL_RATE_AT_TARGET,
      marketParams
    })

    const marketState = {
      totalSupplyAssets: 1n,
      totalSupplyShares: 0n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      lastUpdate: BigInt(Date.now() - 5 * 24 * 3600 * 1000),
      fee: 0n
    }
    const result = await dynamicRate.view.borrowRateView({
      args: { marketParams, marketState }
    })
    const avgRate = result.returns
    const expectedRate = BigInt(0.00724 * 10 ** 18) / ONE_YEAR_IN_SECONDS // ~0.724% APY

    console.log('Avg rate after 5 days at 0% utilization: ' + calculateAPY(avgRate))
    console.log('Expected rate after 5 days at 0% utilization: ' + calculateAPY(expectedRate))

    assertApproxEqual(avgRate, expectedRate, 1000) // 1000 bps tolerance
  })

  it('returns the correct rate after 45 days with utilization above target, no accrual', async () => {
    const signer = await testNodeWallet()
    const dynamicRate = await testFirstInteraction({
      suppliedAssets: 1n * 10n ** 18n,
      borrowedAssets: DynamicRate.consts.TARGET_UTILIZATION,
      expectedAvgRate: DynamicRate.consts.INITIAL_RATE_AT_TARGET,
      expectedRateAtTarget: DynamicRate.consts.INITIAL_RATE_AT_TARGET,
      marketParams,
      signer
    })
    const marketState = {
      totalSupplyAssets: 1n * 10n ** 18n,
      totalSupplyShares: 0n,
      totalBorrowAssets: (DynamicRate.consts.TARGET_UTILIZATION + 1n * 10n ** 18n) / 2n, // 95% utilization
      totalBorrowShares: 0n,
      lastUpdate: BigInt(Date.now() - 45 * 24 * 3600 * 1000),
      fee: 0n
    }
    const txResult = await dynamicRate.transact.borrowRate({
      signer: signer,
      args: { marketParams, marketState }
    })
    await waitForTxConfirmation(txResult.txId, 1, 2)

    const { events } = await signer.nodeProvider!.events.getEventsContractContractaddress(dynamicRate.address, {
      start: 0
    })

    const rateAtTarget = BigInt(events[1].fields[2].value as string)
    const expectedRate = BigInt(0.8722 * 10 ** 18) / ONE_YEAR_IN_SECONDS // ~87.22% APY

    console.log('Rate at target after 45 days above target utilization: ' + calculateAPY(rateAtTarget))
    console.log('Expected rate at target after 45 days above target utilization: ' + calculateAPY(expectedRate))

    assertApproxEqual(rateAtTarget, expectedRate, 50)
  })

  // it('return correct rate after 45 days with utilization above target, with accrual every minute', async () => {
  //   const signer = await testNodeWallet()
  //   const dynamicRate = await testFirstInteraction({
  //     suppliedAssets: 1n * 10n ** 18n,
  //     borrowedAssets: DynamicRate.consts.TARGET_UTILIZATION,
  //     expectedAvgRate: DynamicRate.consts.INITIAL_RATE_AT_TARGET,
  //     expectedRateAtTarget: DynamicRate.consts.INITIAL_RATE_AT_TARGET,
  //     marketParams,
  //     signer
  //   })
  //   const initialBorrowAssets = (DynamicRate.consts.TARGET_UTILIZATION + 1n * 10n ** 18n) / 2n // 95% utilization
  //   const marketState = {
  //     totalSupplyAssets: 1n * 10n ** 18n,
  //     totalSupplyShares: 0n,
  //     totalBorrowAssets: initialBorrowAssets,
  //     totalBorrowShares: 0n,
  //     lastUpdate: BigInt(Date.now() - 45 * 24 * 3600 * 1000),
  //     fee: 0n
  //   }

  //   const minuteInSeconds = 60
  //   const days = 1
  //   const hours = 24
  //   const secondsInHour = 3600
  //   const minutes = 24 * 60 * days

  //   let rateAtTarget = 0n

  //   for (let i = 0; i < minutes; ++i) {
  //     console.log(`--- Minute ${i + 1} ---`)
  //     marketState.lastUpdate =
  //       BigInt(Date.now() - days * hours * secondsInHour * 1000) + BigInt(i * minuteInSeconds * 1000)
  //     const [avgBorrowRate, currentRateAtTarget] = await updateBorrowRate({
  //       marketParams,
  //       marketState,
  //       dynamicRate,
  //       signer
  //     })
  //     rateAtTarget = currentRateAtTarget

  //     const interest = wadMul(marketState.totalBorrowAssets, wTaylorCompounded(avgBorrowRate, BigInt(minuteInSeconds)))
  //     marketState.totalSupplyAssets += interest
  //     marketState.totalBorrowAssets += interest
  //   }

  //   assertApproxEqual(
  //     wadDiv(marketState.totalBorrowAssets, marketState.totalSupplyAssets),
  //     BigInt(0.95 * 10 ** 18),
  //     100
  //   )

  //   // Expected rate: 4% * exp(50 * 1 / 365 * 50%) = 4.28%.
  //   const expectedRateAtTarget = BigInt(0.0428 * 10 ** 18) / ONE_YEAR_IN_SECONDS

  //   console.log('Rate at target: ' + calculateAPY(rateAtTarget))
  //   console.log('Expected rate at target: ' + calculateAPY(expectedRateAtTarget))

  //   expect(rateAtTarget).toBeGreaterThanOrEqual(expectedRateAtTarget)
  // })

  it('returns the correct rate after days when utilization is at target, without accrual', async () => {
    const signer = await testNodeWallet()
    const dynamicRate = await testFirstInteraction({
      suppliedAssets: 1n * 10n ** 18n,
      borrowedAssets: DynamicRate.consts.TARGET_UTILIZATION,
      expectedAvgRate: DynamicRate.consts.INITIAL_RATE_AT_TARGET,
      expectedRateAtTarget: DynamicRate.consts.INITIAL_RATE_AT_TARGET,
      marketParams,
      signer
    })

    const randomDays = Math.floor(Math.random() * 100)
    const marketState = {
      totalSupplyAssets: 1n * 10n ** 18n,
      totalSupplyShares: 0n,
      totalBorrowAssets: DynamicRate.consts.TARGET_UTILIZATION,
      totalBorrowShares: 0n,
      lastUpdate: BigInt(Date.now() - randomDays * 24 * 3600 * 1000),
      fee: 0n
    }

    const [, rateAtTarget] = await updateBorrowRate({
      dynamicRate,
      signer,
      marketParams,
      marketState
    })
    expect(rateAtTarget).toEqual(DynamicRate.consts.INITIAL_RATE_AT_TARGET)
  })

  it('first borrowRate call', async () => {
    const marketState = {
      totalSupplyAssets: 1n * 10n ** 18n,
      totalSupplyShares: 0n,
      totalBorrowAssets: 5n * 10n ** 17n,
      totalBorrowShares: 0n,
      lastUpdate: 0n,
      fee: 0n
    }
    const expectedAvgRate = applyCurve(DynamicRate.consts.INITIAL_RATE_AT_TARGET, _err(marketState))
    const expectedRateAtTarget = DynamicRate.consts.INITIAL_RATE_AT_TARGET
    await testFirstInteraction({
      suppliedAssets: 1n * 10n ** 18n,
      borrowedAssets: 5n * 10n ** 17n,
      expectedAvgRate,
      expectedRateAtTarget,
      marketParams
    })
  })

  it('first borrowRateView call', async () => {
    const signer = await testNodeWallet()
    const marketState = {
      totalSupplyAssets: 1n * 10n ** 18n,
      totalSupplyShares: 0n,
      totalBorrowAssets: 5n * 10n ** 17n,
      totalBorrowShares: 0n,
      lastUpdate: BigInt(Date.now()),
      fee: 0n
    }
    const dynamicRateId = await deployDynamicRate(signer)
    const dynamicRate = DynamicRate.at(addressFromContractId(dynamicRateId))

    const result = await dynamicRate.transact.initInterest({
      args: { marketParams, marketState },
      signer: signer,
      attoAlphAmount: MAP_ENTRY_DEPOSIT
    })
    await waitForTxConfirmation(result.txId, 1, 2)

    const viewResult = await dynamicRate.view.borrowRateView({
      args: { marketParams, marketState }
    })

    const expectedAvgRate = applyCurve(DynamicRate.consts.INITIAL_RATE_AT_TARGET, _err(marketState))
    expect(viewResult.returns).toEqual(expectedAvgRate)
  })

  it('borrowRate', async () => {
    //TODO
  })

  it('borrowRate no time elapsed', async () => {
    //TODO
  })

  it('borrowRate no utilization change', async () => {
    //TODO
  })
})
