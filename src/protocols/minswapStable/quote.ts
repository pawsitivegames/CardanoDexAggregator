import { getD, getY } from "./math";
import type { MinswapStablePool } from "./types";

/**
 * Quote an exact-in swap using the Minswap Stableswap formula.
 *
 * The swap applies the Curve StableSwap invariant:
 * 1. Scale balances by multiples to get "calculation units"
 * 2. Compute current D (invariant)
 * 3. Add amountIn (scaled) to input balance
 * 4. Solve invariant for new output balance using getY
 * 5. Compute actual output (delta in original units)
 * 6. Apply trading fee on output side: amountOut = (dy - fee) / multiple[j]
 *
 * Formula reference: vendor/reference/minswap-stableswap/stableswap-docs/formula.md
 *
 * @param pool Pool state with balances, multiples, amp, and fee structure
 * @param inIndex Index of input asset in pool.assets
 * @param outIndex Index of output asset in pool.assets
 * @param amountIn Amount of input asset in smallest units
 * @returns Amount of output asset in smallest units (after fee), floored
 * @throws Error if indices are invalid, amountIn <= 0, or indices are identical
 */
export function quoteExactIn(
  pool: MinswapStablePool,
  inIndex: number,
  outIndex: number,
  amountIn: bigint,
): bigint {
  if (amountIn <= 0n) {
    throw new Error("amountIn must be > 0");
  }

  const length = pool.assets.length;
  if (inIndex < 0 || inIndex >= length) {
    throw new Error(`inIndex ${inIndex} out of bounds [0, ${length - 1}]`);
  }
  if (outIndex < 0 || outIndex >= length) {
    throw new Error(`outIndex ${outIndex} out of bounds [0, ${length - 1}]`);
  }
  if (inIndex === outIndex) {
    throw new Error("inIndex and outIndex must be different");
  }

  // Convert balances to scaled "calculation units"
  const mulBalances = pool.balances.map((b, i) => b * pool.multiples[i]);

  // Compute new input balance in calculation units
  const mulIn = pool.multiples[inIndex];
  const x = mulBalances[inIndex] + amountIn * mulIn;

  // Solve invariant for new output balance (in calculation units)
  const y = getY(inIndex, outIndex, x, mulBalances, pool.amp);

  // Compute delta in calculation units
  const dy = mulBalances[outIndex] - y;

  // Apply trading fee on output side
  // fee = dy * tradeFeeNumerator / feeDenominator
  // amountOut = (dy - fee) / multiple[j]
  const dyFee = (dy * pool.tradeFeeNumerator) / pool.feeDenominator;
  const dyAfterFee = dy - dyFee;

  const mulOut = pool.multiples[outIndex];
  const amountOut = dyAfterFee / mulOut;

  if (amountOut <= 0n) {
    throw new Error("Swap amount too small, no output after fee");
  }

  return amountOut;
}

/**
 * Helper to find an asset index by its unit string.
 *
 * @param pool The pool
 * @param assetUnit Unit string to search for
 * @returns Index if found
 * @throws Error if not found
 */
export function findAssetIndex(pool: MinswapStablePool, assetUnit: string): number {
  const index = pool.assets.indexOf(assetUnit);
  if (index === -1) {
    throw new Error(`Asset ${assetUnit} not found in pool`);
  }
  return index;
}

/**
 * Quote an exact-in swap by asset unit (convenience overload).
 *
 * @param pool The pool
 * @param assetInUnit Unit string of input asset
 * @param assetOutUnit Unit string of output asset
 * @param amountIn Amount of input asset
 * @returns Amount of output asset after fee
 */
export function quoteExactInByAsset(
  pool: MinswapStablePool,
  assetInUnit: string,
  assetOutUnit: string,
  amountIn: bigint,
): bigint {
  const inIndex = findAssetIndex(pool, assetInUnit);
  const outIndex = findAssetIndex(pool, assetOutUnit);
  return quoteExactIn(pool, inIndex, outIndex, amountIn);
}
