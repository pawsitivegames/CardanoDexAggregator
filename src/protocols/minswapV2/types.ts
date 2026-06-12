/**
 * Minswap V2 pool representation in normalized form.
 * Reserves are sourced from the datum, not the UTxO value.
 * Fees are per-direction numerators over a fixed denominator (10000).
 */
export type MinswapV2Pool = {
  poolId: string;
  assetA: string;
  assetB: string;
  reserveA: bigint;
  reserveB: bigint;
  baseFeeANumerator: bigint;
  baseFeeBNumerator: bigint;
  feeDenominator: bigint; // = 10000n
};
