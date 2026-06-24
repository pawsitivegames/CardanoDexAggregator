/**
 * VyFinance pool representation in normalized form.
 *
 * QUIRKS: VyFinance is closed-source and has an opaque datum.
 * Reserves come from the UTxO VALUE (utxo.assets), NOT from a decoded datum.
 * Pool discovery is via api.vyfi.io/lp?networkId=1 (enumerate pool addresses) —
 * that is a LIVE concern, out of scope for offline fixture tests.
 *
 * Fees: VyFinance charges 0.3% LP + a "bar fee", modeled as a single feeBasisPoints field.
 * Default: 30 basis points (0.3%) if bar fee is unknown; allow override via opts.
 */
export type VyFinancePool = {
  poolId: string;
  assetA: string;
  assetB: string;
  reserveA: bigint;
  reserveB: bigint;
  feeBasisPoints: bigint; // default 30 (0.3%), allowed 1..10000
};
