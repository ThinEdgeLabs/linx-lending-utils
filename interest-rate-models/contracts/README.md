# Interest Rate Models

This module implements two different interest rate models for the Linx lending
protocol: a dynamic rate model and a fixed rate model.

## Overview

The interest rate models determine how borrowing rates are calculated in the
lending protocol. The system supports two types of models:

1. **Dynamic Rate Model**: Adjusts rates based on market utilization and target
   parameters
2. **Fixed Rate Model**: Maintains a constant borrowing rate regardless of
   market conditions

## Constants

The `Constants` contract defines shared constants and data structures used
across rate models:

```ral
const MAX_BORROW_RATE = 1e20      // 100% in Wei format
const WAD = 1e18i                 // 1.0 in fixed-point format
const TARGET_UTILIZATION = 9e17i  // 90% target utilization
const INITIAL_RATE_AT_TARGET = 4e16i / 31536000i  // 4% per year (per second)
const ADJUSTMENT_SPEED = 5e19i / 31536000i        // 50/year (per second)
const CURVE_STEEPNESS = 4e18i     // Curve steepness parameter
const MIN_RATE_AT_TARGET = 1e15i / 31536000i      // 0.1% per year (per second)
const MAX_RATE_AT_TARGET = 2e18i / 31536000i      // 200% per year (per second)
```

### Data Structures

```ral
struct MarketParams {
    loanToken: Address,
    collateralToken: Address,
    oracle: Address
}

struct MarketState {
    totalSupplyAssets: U256,
    totalSupplyShares: U256,
    totalBorrowAssets: U256,
    totalBorrowShares: U256,
    lastUpdate: U256,
    fee: U256
}
```

## Dynamic Rate Model

The `DynamicRate` contract implements an adaptive interest rate model that
adjusts rates based on market utilization.

### Features

- Rate adjustment based on market utilization
- Target utilization tracking
- Smooth rate transitions
- Admin-controlled parameters

### Key Functions

```ral
/// Calculates and updates the borrow rate based on current market conditions
/// 
/// # Arguments
/// * `marketParams` - Market parameters including loan and collateral tokens
/// * `marketState` - Current state of the market
/// 
/// # Returns
/// The new average borrow rate
pub fn getBorrowRateAndUpdate(marketParams: MarketParams, marketState: MarketState) -> U256

/// Returns the current borrow rate without modifying state
/// 
/// # Arguments
/// * `marketParams` - Market parameters
/// * `marketState` - Current market state
/// 
/// # Returns
/// The current borrow rate
pub fn borrowRate(marketParams: MarketParams, marketState: MarketState) -> U256

/// Transfers admin rights to a new address
/// 
/// # Arguments
/// * `newAdmin` - Address of the new admin
pub fn transferAdmin(newAdmin: Address) -> ()
```

## Fixed Rate Model

The `FixedRate` contract implements a simple constant interest rate model.

### Features

- Constant borrowing rate
- One-time rate setting by admin
- Rate validation against maximum bounds

### Key Functions

```ral
/// Returns the fixed borrow rate
/// 
/// # Arguments
/// * `marketParams` - Market parameters (unused)
/// * `marketState` - Market state (unused)
/// 
/// # Returns
/// The fixed borrow rate
pub fn borrowRate(marketParams: MarketParams, marketState: MarketState) -> U256

/// Sets the borrow rate (can only be called once by admin)
/// 
/// # Arguments
/// * `newBorrowRate` - The new fixed rate to set
pub fn setBorrowRate(newBorrowRate: U256) -> ()
```

## Error Codes

The system defines the following error codes:

```ral
enum ErrorCodes {
    NotAuthorized = 0,    // Caller is not authorized to perform the action
    RateAlreadySet = 1,   // Rate has already been set and cannot be changed
    InvalidRate = 2,      // Rate is outside valid bounds
    ZeroAddress = 3       // Invalid zero address provided
}
```

## Events

### Dynamic Rate Model Events

```ral
event BorrowRateUpdate(id: ByteVec, avgBorrowRate: U256, newRateAtTarget: U256)
event AdminTransferred(oldAdmin: Address, newAdmin: Address)
```

### Fixed Rate Model Events

```ral
event RateSet(setter: Address, oldRate: U256, newRate: U256)
```
