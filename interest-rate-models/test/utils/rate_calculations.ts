
export const WAD = 10n ** 18n
export const TARGET_UTILIZATION = 9n * 10n ** 17n // 0.9 * 10^18 (90%)
const SECONDS_PER_YEAR = 31536000n
export const INITIAL_RATE_AT_TARGET = 4n * 10n ** 16n / SECONDS_PER_YEAR // 4% per year (per second)
export const MIN_RATE_AT_TARGET = 1n * 10n ** 15n / SECONDS_PER_YEAR // 0.1% per year (per second)
export const MAX_RATE_AT_TARGET = 2n * 10n ** 18n / SECONDS_PER_YEAR // 200% per year (per second)
export const ADJUSTMENT_SPEED = 5n * 10n ** 19n / SECONDS_PER_YEAR // 50/year (per second)
export const CURVE_STEEPNESS = 4n * 10n ** 18n
export const MIN_RATE = 2n * 10n ** 16n // 0.02 * 10^18 (2%)
export const MAX_RATE = 1n * 10n ** 20n // 1.0 * 10^20 (100%)

export function wadMul(a: bigint, b: bigint): bigint {
    return (a * b) / WAD;
}

export function wadDiv(a: bigint, b: bigint): bigint {
    if (b === 0n) return 0n;
    return (a * WAD) / b;
}

export function wadExp(x: bigint): bigint {
    if (x === 0n) {
        return WAD;
    }

    const x2 = wadMul(x, x);
    const x3 = wadMul(x2, x);

    // e^x ≈ 1 + x + x^2/2 + x^3/6
    return WAD + x + wadDiv(x2, 2n * WAD) + wadDiv(x3, 6n * WAD);
}

// Calculate new rate with exponential growth/decay (from CurveUtils)
export function newRateAtTarget(startRateAtTarget: bigint, linearAdaptation: bigint): bigint {
    const expFactor = wadExp(linearAdaptation);
    const newRate = wadMul(startRateAtTarget, expFactor);

    // Bound the rate
    if (newRate < MIN_RATE_AT_TARGET) {
        return MIN_RATE_AT_TARGET;
    } else if (newRate > MAX_RATE_AT_TARGET) {
        return MAX_RATE_AT_TARGET;
    } else {
        return newRate;
    }
}

// Apply rate curve based on error (from CurveUtils)
export function applyCurve(rateAtTarget: bigint, err: bigint): bigint {
    let coeff = CURVE_STEEPNESS - WAD;
    if (err < 0n) {
        coeff = WAD - wadDiv(WAD, CURVE_STEEPNESS);
    }

    return wadMul(wadMul(coeff, err) + WAD, rateAtTarget);
}

// Calculate borrow rate based on market conditions
export function calculateBorrowRate(marketState: any, existingRateAtTarget: bigint = 0n): bigint {
    // Calculate utilization
    let utilization = 0n;
    if (marketState.totalSupplyAssets > 0n) {
        utilization = wadDiv(marketState.totalBorrowAssets, marketState.totalSupplyAssets);
    }

    // Calculate error normalized by distance to target
    let errNormFactor = TARGET_UTILIZATION;
    if (utilization > TARGET_UTILIZATION) {
        errNormFactor = WAD - TARGET_UTILIZATION;
    }

    let err = 0n;
    if (errNormFactor > 0n) {
        err = wadDiv(utilization - TARGET_UTILIZATION, errNormFactor);
    }

    let startRateAtTarget = existingRateAtTarget;
    let avgRateAtTarget = 0n;
    let endRateAtTarget = 0n;

    if (startRateAtTarget === 0n) {
        // First interaction
        avgRateAtTarget = INITIAL_RATE_AT_TARGET;
        endRateAtTarget = INITIAL_RATE_AT_TARGET;
    } else {
        // Calculate adjustment
        const speed = wadMul(ADJUSTMENT_SPEED, err);
        const elapsed = BigInt(Math.floor(Date.now() / 1000)) - marketState.lastUpdate;
        const linearAdaptation = speed * elapsed;

        if (linearAdaptation === 0n) {
            avgRateAtTarget = startRateAtTarget;
            endRateAtTarget = startRateAtTarget;
        } else {
            endRateAtTarget = newRateAtTarget(startRateAtTarget, linearAdaptation);
            const midRateAtTarget = newRateAtTarget(startRateAtTarget, linearAdaptation / 2n);
            avgRateAtTarget = (startRateAtTarget + endRateAtTarget + 2n * midRateAtTarget) / 4n;
        }
    }

    // Apply the rate curve
    const avgRate = applyCurve(avgRateAtTarget, err);
    return avgRate;
} 