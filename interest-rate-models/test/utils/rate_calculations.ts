import { MarketState } from '../../artifacts/ts/types'

export const WAD = 10n ** 18n
export const TARGET_UTILIZATION = 9n * 10n ** 17n // 0.9 * 10^18 (90%)
const SECONDS_PER_YEAR = 31536000n
export const INITIAL_RATE_AT_TARGET = (4n * 10n ** 16n) / SECONDS_PER_YEAR // 4% per year (per second)
export const MIN_RATE_AT_TARGET = (1n * 10n ** 15n) / SECONDS_PER_YEAR // 0.1% per year (per second)
export const MAX_RATE_AT_TARGET = (2n * 10n ** 18n) / SECONDS_PER_YEAR // 200% per year (per second)
export const ADJUSTMENT_SPEED = (5n * 10n ** 19n) / SECONDS_PER_YEAR // 50/year (per second)
export const CURVE_STEEPNESS = 4n * 10n ** 18n
export const MIN_RATE = 2n * 10n ** 16n // 0.02 * 10^18 (2%)
export const MAX_RATE = 1n * 10n ** 20n // 1.0 * 10^20 (100%)

// ----- Exponential approximation constants (WAD-scaled) -----
const LN_2_INT = 693147180559945309n // ln(2) * 1e18
const LN_WEI_INT = -41446531673892822312n // ln(1e-18)
const WEXP_UPPER_BOUND = 93859467695000404319n // ln(type(int256).max / 1e36)
const WEXP_UPPER_VALUE = 57716089161558943949701069502944508345128422502756744429568n // pre-computed e^{WEXP_UPPER_BOUND}

export function wadMul(a: bigint, b: bigint): bigint {
  return (a * b) / WAD
}

export function wadDiv(a: bigint, b: bigint): bigint {
  if (b === 0n) return 0n
  return (a * WAD) / b
}

export function wadExp(x: bigint): bigint {
  // Under-flow cut-off: exp(x) < 1e-18 ⇒ rounds to 0.
  if (x < LN_WEI_INT) {
    return 0n
  }

  // Upper bound to avoid overflow downstream (when multiplied by WAD)
  if (x >= WEXP_UPPER_BOUND) {
    return WEXP_UPPER_VALUE
  }

  // Decompose x = q · ln(2) + r  with  –ln(2)/2 ≤ r ≤ ln(2)/2
  let roundingAdjustment = LN_2_INT / 2n
  if (x < 0n) {
    roundingAdjustment = -roundingAdjustment
  }
  const q = (x + roundingAdjustment) / LN_2_INT
  const r = x - q * LN_2_INT

  // e^r ≈ 1 + r + r²/2  (2-nd order Taylor)
  const rSquared = wadMul(r, r)
  let expR = WAD + r + rSquared / 2n

  // e^x = 2^q · e^r  (bit-shift for power-of-two scaling)
  if (q >= 0n) {
    expR = expR << q
  } else {
    expR = expR >> -q
  }

  return expR
}

// Calculate new rate with exponential growth/decay (from CurveUtils)
export function newRateAtTarget(startRateAtTarget: bigint, linearAdaptation: bigint): bigint {
  const expFactor = wadExp(linearAdaptation)
  const newRate = wadMul(startRateAtTarget, expFactor)

  // Bound the rate
  if (newRate < MIN_RATE_AT_TARGET) {
    return MIN_RATE_AT_TARGET
  } else if (newRate > MAX_RATE_AT_TARGET) {
    return MAX_RATE_AT_TARGET
  } else {
    return newRate
  }
}

// Apply rate curve based on error (from CurveUtils)
export function applyCurve(rateAtTarget: bigint, err: bigint): bigint {
  let coeff = CURVE_STEEPNESS - WAD
  if (err < 0n) {
    coeff = WAD - wadDiv(WAD, CURVE_STEEPNESS)
  }

  return wadMul(wadMul(coeff, err) + WAD, rateAtTarget)
}

// Calculate borrow rate based on market conditions
export function calculateBorrowRate(marketState: MarketState, existingRateAtTarget: bigint = 0n): bigint {
  // Calculate utilization
  let utilization = 0n
  if (marketState.totalSupplyAssets > 0n) {
    utilization = wadDiv(marketState.totalBorrowAssets, marketState.totalSupplyAssets)
  }

  // Calculate error normalized by distance to target
  let errNormFactor = TARGET_UTILIZATION
  if (utilization > TARGET_UTILIZATION) {
    errNormFactor = WAD - TARGET_UTILIZATION
  }

  let err = 0n
  if (errNormFactor > 0n) {
    err = wadDiv(utilization - TARGET_UTILIZATION, errNormFactor)
  }

  const startRateAtTarget = existingRateAtTarget
  let avgRateAtTarget = 0n
  let endRateAtTarget = 0n

  if (startRateAtTarget === 0n) {
    // First interaction
    avgRateAtTarget = INITIAL_RATE_AT_TARGET
    endRateAtTarget = INITIAL_RATE_AT_TARGET
  } else {
    // Calculate adjustment
    const speed = wadMul(ADJUSTMENT_SPEED, err)
    const elapsed = BigInt(Math.floor(Date.now() / 1000)) - marketState.lastUpdate
    const linearAdaptation = speed * elapsed

    if (linearAdaptation === 0n) {
      avgRateAtTarget = startRateAtTarget
      endRateAtTarget = startRateAtTarget
    } else {
      endRateAtTarget = newRateAtTarget(startRateAtTarget, linearAdaptation)
      const midRateAtTarget = newRateAtTarget(startRateAtTarget, linearAdaptation / 2n)
      avgRateAtTarget = (startRateAtTarget + endRateAtTarget + 2n * midRateAtTarget) / 4n
    }
  }

  // Apply the rate curve
  const avgRate = applyCurve(avgRateAtTarget, err)
  return avgRate
}
