import type { SplashPool } from "./types";

/**
 * Quote an exact-in swap using the Splash classic CFMM formula.
 *
 * Formula (from dexter splash.ts estimatedReceive with fee):
 * out = (amountIn * (feeDenominator - lpFee) * reserveOut) / (reserveIn * feeDenominator + amountIn * (feeDenominator - lpFee))
 *
 * Where:
 * - feeDenominator = 1000 (for Splash classic)
 * - lpFee = fee numerator (e.g., 997 for 0.3% fee, so effective fee = 1000 - 997 = 3 basis points)
 * - amountIn = input amount in smallest units
 * - reserveIn = input asset reserve
 * - reserveOut = output asset reserve
 *
 * All divisions use bigint floor division.
 *
 * @param pool Pool state with reserves and fee structure
 * @param assetIn Unit string of the input asset
 * @param amountIn Amount of input asset in smallest units
 * @returns Amount of output asset in smallest units, floored
 * @throws Error if amountIn <= 0 or assetIn is not in the pool
 */
export function quoteExactIn(
  pool: SplashPool,
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

  const fd = pool.feeDenominator;
  const fn = pool.lpFee;

  // out = (amountIn * (feeDenominator - lpFee) * reserveOut) / (reserveIn * feeDenominator + amountIn * (feeDenominator - lpFee))
  const feeModifier = fd - fn;
  const numerator = amountIn * feeModifier * reserveOut;
  const denominator = reserveIn * fd + amountIn * feeModifier;

  return numerator / denominator;
}
