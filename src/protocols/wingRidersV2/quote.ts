import type { WingRidersV2Pool } from "./types";

/**
 * Calculate true reserves accounting for treasury and staking rewards.
 * WingRiders V2 pool datum carries PoolAssetATreasury/PoolAssetBTreasury and staking-reward ADA.
 * True reserves = UTxO value − treasury − (adaIsAsset ? stakingRewardsAda : 0)
 *
 * @param pool Pool state with reserves and treasury fields
 * @returns Object with trueReserveA and trueReserveB (bigint)
 */
export function trueReserves(pool: WingRidersV2Pool): {
  a: bigint;
  b: bigint;
} {
  // Subtract treasury from raw reserves
  let trueReserveA = pool.reserveA - pool.treasuryA;
  let trueReserveB = pool.reserveB - pool.treasuryB;

  // Additional ADA-side subtraction for staking rewards
  if (pool.adaIsAssetA) {
    trueReserveA -= pool.stakingRewardsAda;
  }
  if (pool.adaIsAssetB) {
    trueReserveB -= pool.stakingRewardsAda;
  }

  return {
    a: trueReserveA,
    b: trueReserveB,
  };
}

/**
 * Quote an exact-in swap using the WingRiders V2 constant-product formula.
 * Uses the same formula as Dexter's estimatedReceive():
 *
 * feeMod = 10000 - round(poolFeePercent/100 * 10000)
 * out = (amountIn * reserveOut * feeMod) / (amountIn * feeMod + reserveIn * 10000)
 *
 * Where poolFeePercent is converted from feeBasisPoints (e.g., 35 bps = 0.35%).
 * Divisor is always 10000 (fixed CFMM base).
 *
 * All divisions use bigint floor division.
 *
 * @param pool Pool state with reserves, treasury, and fee structure
 * @param assetIn Unit string of the input asset
 * @param amountIn Amount of input asset in smallest units (lovelace, base token unit, etc.)
 * @returns Amount of output asset in smallest units, floored
 * @throws Error if amountIn <= 0 or assetIn is not in the pool
 */
export function quoteExactIn(
  pool: WingRidersV2Pool,
  assetIn: string,
  amountIn: bigint,
): bigint {
  if (amountIn <= 0n) {
    throw new Error("amountIn must be > 0");
  }

  const isAtoB = assetIn === pool.assetA;
  const isBtoA = assetIn === pool.assetB;

  if (!isAtoB && !isBtoA) {
    throw new Error(`assetIn ${assetIn} not found in pool`);
  }

  // Get true reserves (accounting for treasury and staking rewards)
  const reserves = trueReserves(pool);
  const reserveIn = isAtoB ? reserves.a : reserves.b;
  const reserveOut = isAtoB ? reserves.b : reserves.a;

  // Compute feeMod from feeBasisPoints
  // feeBasisPoints is already in basis points (e.g., 35 bps = 0.35%)
  // feeMod = 10000 - feeBasisPoints (since feeBasisPoints is already scaled by 100 vs percent)
  const feeBasisPoints = pool.feeBasisPoints;
  const feeMod = 10000n - feeBasisPoints;
  const feeMultiplier = 10000n;

  // out = (amountIn * reserveOut * feeMod) / (amountIn * feeMod + reserveIn * 10000)
  const numerator = amountIn * reserveOut * feeMod;
  const denominator = amountIn * feeMod + reserveIn * feeMultiplier;

  return numerator / denominator;
}

/**
 * TODO: Implement stableswap variant for WingRiders V2.
 * Currently only CFMM (constant-product) is implemented.
 * Stableswap uses a different curve (similar to Curve.fi) with extra parameters.
 */
