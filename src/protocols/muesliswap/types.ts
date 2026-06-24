/**
 * MuesliSwap pool representation in normalized form.
 * Reserves are sourced from the datum.
 * Fees are expressed as feeNumerator/feeDenominator (e.g. 30/10000 = 0.3%).
 */
export type MuesliSwapPool = {
  poolId: string;
  assetA: string;
  assetB: string;
  reserveA: bigint;
  reserveB: bigint;
  feeNumerator: bigint;  // Flat fee for both directions (MuesliSwap uses a single rate)
  feeDenominator: bigint;  // = 10000n
};
