import type { MinswapV2Pool } from "./types";

/**
 * Quote an exact-in swap using the Minswap V2 formula.
 *
 * Formula (from vendor/reference/minswap-dex-v2/amm-v2-docs/formula.md):
 * Δy = ((f_d - f_n) * Δx * y0) / (x0 * f_d + (f_d - f_n) * Δx)
 *
 * Where:
 * - f_d = feeDenominator (10000)
 * - f_n = per-direction fee numerator (baseFeeANumerator or baseFeeBNumerator)
 * - Δx = amountIn
 * - x0 = reserveIn
 * - y0 = reserveOut
 *
 * All divisions use bigint floor division.
 *
 * @param pool Pool state with reserves and fee structure
 * @param assetIn Unit string of the input asset
 * @param amountIn Amount of input asset in smallest units (lovelace, base token unit, etc.)
 * @returns Amount of output asset (Δy) in smallest units, floored
 * @throws Error if amountIn <= 0 or assetIn is not in the pool
 */
export function quoteExactIn(
  pool: MinswapV2Pool,
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

  const [reserveIn, reserveOut] = isAtoB
    ? [pool.reserveA, pool.reserveB]
    : [pool.reserveB, pool.reserveA];

  const fn = isAtoB ? pool.baseFeeANumerator : pool.baseFeeBNumerator;
  const fd = pool.feeDenominator;

  // Δy = ((f_d - f_n) * Δx * y0) / (x0 * f_d + (f_d - f_n) * Δx)
  const numerator = (fd - fn) * amountIn * reserveOut;
  const denominator = reserveIn * fd + (fd - fn) * amountIn;

  return numerator / denominator;
}
