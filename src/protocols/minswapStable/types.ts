/**
 * Minswap Stableswap pool representation.
 * Stableswap uses the Curve StableSwap invariant with support for multiple assets
 * that may have different decimal places via the `multiples` scaling factors.
 */
export type MinswapStablePool = {
  poolId: string;
  assets: string[]; // asset unit strings (indices correspond to datum balances/multiples)
  balances: bigint[]; // datum-level balances (NOT scaled by multiples yet)
  multiples: bigint[]; // scaling factors to convert from token units to calculation units
  amp: bigint; // Amplification coefficient A (per formula.md, stored as A itself, not A*n^n)
  tradeFeeNumerator: bigint; // fee numerator (on output)
  feeDenominator: bigint; // fee denominator (typically 10_000_000_000n)
};
