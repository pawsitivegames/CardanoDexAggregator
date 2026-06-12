/**
 * WingRiders V2 pool representation in normalized form.
 * Reserves and treasury fields are sourced from the datum.
 * True reserves = reserve - treasury - (staking rewards if ADA).
 * Fees are expressed in basis points (e.g., 35 = 0.35%).
 */
export type WingRidersV2Pool = {
  poolId: string;
  assetA: string;
  assetB: string;
  reserveA: bigint;
  reserveB: bigint;
  treasuryA: bigint;
  treasuryB: bigint;
  stakingRewardsAda: bigint; // Additional ADA-side subtraction for true reserves
  feeBasisPoints: bigint; // e.g., 35n = 0.35%
  adaIsAssetA: boolean;
  adaIsAssetB: boolean;
};
