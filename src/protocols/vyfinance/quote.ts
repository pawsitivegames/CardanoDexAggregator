import type { VyFinancePool } from "./types";

/**
 * Quote an exact-in swap using the VyFinance CFMM formula.
 *
 * VyFinance uses constant-product with a single fee model:
 * feeMod = 10000 - feeBasisPoints
 * out = (amountIn * reserveOut * feeMod) / (amountIn * feeMod + reserveIn * 10000)
 *
 * Reference: vendor/reference/dexter/src/dex/vyfinance.ts estimatedReceive()
 * which uses poolFeeModifier = poolFeeMultiplier - fee, where poolFeeMultiplier = 1000
 * but we use 10000 as the standard basis point denominator for consistency.
 *
 * @param pool Pool state with reserves and fee structure
 * @param assetIn Unit string of the input asset
 * @param amountIn Amount of input asset in smallest units (lovelace, base token unit, etc.)
 * @returns Amount of output asset in smallest units, floored using bigint
 * @throws Error if amountIn <= 0 or assetIn is not in the pool
 */
export function quoteExactIn(
  pool: VyFinancePool,
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

  // feeMod = 10000 - feeBasisPoints
  const FEE_DENOMINATOR = 10000n;
  const feeMod = FEE_DENOMINATOR - pool.feeBasisPoints;

  // out = (amountIn * reserveOut * feeMod) / (amountIn * feeMod + reserveIn * 10000)
  const numerator = amountIn * reserveOut * feeMod;
  const denominator = amountIn * feeMod + reserveIn * FEE_DENOMINATOR;

  return numerator / denominator;
}
