/**
 * Splash classic CFMM pool representation in normalized form.
 * Supports Splash Constant-Product pools (CPP) for exact constant-product swaps.
 *
 * Reserves are sourced from the UTxO assets, adjusted by treasury amounts from the datum.
 * Pool identified by pool NFT + fee structure encoded in the datum.
 *
 * Fee model: Splash classic pools have a single lpFee numerator (stored as pool_fee in datum).
 * The actual fee deduction follows the formula per dexter:
 *   poolFeePercent = (1000 - lpFee) / 10
 * where lpFee is an integer (e.g., lpFee=997 -> 0.3% fee).
 *
 * Constant-product formula with fee:
 *   out = (amountIn * (feeDenominator - lpFee) * reserveOut) / (reserveIn * feeDenominator + amountIn * (feeDenominator - lpFee))
 * where feeDenominator = 1000 for Splash classic pools.
 */
export type SplashPool = {
  poolId: string;
  assetA: string;
  assetB: string;
  reserveA: bigint;
  reserveB: bigint;
  lpFee: bigint; // fee numerator (e.g., 997 for 0.3% fee)
  feeDenominator: bigint; // = 1000n for classic pools
};
