import type { MuesliSwapPool } from "./types";

/**
 * Quote an exact-in swap using the MuesliSwap formula.
 *
 * MuesliSwap is a Minswap-style CFMM with a flat fee applied to the input.
 *
 * Formula (from vendor/reference/dexter/src/dex/muesliswap.ts):
 *   swapFee = (amountIn * feeNumerator + feeDenominator - 1) / feeDenominator  // ceil
 *   adjustedIn = amountIn - swapFee
 *   out = reserveOut - (reserveIn * reserveOut) / (reserveIn + adjustedIn)    // floor
 *
 * Where:
 * - amountIn: input amount in base units
 * - feeNumerator: fee numerator (e.g. 30 for 0.3%)
 * - feeDenominator: fee denominator (10000)
 * - reserveIn: reserve of input asset
 * - reserveOut: reserve of output asset
 *
 * All divisions use bigint floor division. Fee calculation uses ceiling.
 *
 * @param pool Pool state with reserves and fee structure
 * @param assetIn Unit string of the input asset
 * @param amountIn Amount of input asset in smallest units (lovelace, base token unit, etc.)
 * @returns Amount of output asset in smallest units, floored
 * @throws Error if amountIn <= 0 or assetIn is not in the pool
 */
export function quoteExactIn(
  pool: MuesliSwapPool,
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

  const reserveIn = isAtoB ? pool.reserveA : pool.reserveB;
  const reserveOut = isAtoB ? pool.reserveB : pool.reserveA;

  // Calculate swap fee with ceiling: (amountIn * feeNumerator + feeDenominator - 1) / feeDenominator
  const swapFee =
    (amountIn * pool.feeNumerator + pool.feeDenominator - 1n) / pool.feeDenominator;

  // Adjusted input amount after fee deduction
  const adjustedIn = amountIn - swapFee;

  // Constant product formula: out = reserveOut - (reserveIn * reserveOut) / (reserveIn + adjustedIn)
  const out =
    reserveOut - (reserveIn * reserveOut) / (reserveIn + adjustedIn);

  return out;
}
