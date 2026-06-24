import type { ChainUtxo } from "../../chain/poolStateProvider";
import type { VyFinancePool } from "./types";

/**
 * Decode a VyFinance pool from a UTxO.
 *
 * VyFinance datum is opaque (closed-source), so reserves are sourced from
 * the UTxO VALUE (utxo.assets), NOT from a decoded datum.
 *
 * @param utxo The chain UTxO containing the pool
 * @param opts.assetA Unit string of asset A (required, e.g., "lovelace")
 * @param opts.assetB Unit string of asset B (required, e.g., policy+name hex)
 * @param opts.feeBasisPoints Fee in basis points (optional, default 30 for 0.3%)
 * @returns Decoded VyFinancePool with reserves pulled from utxo.assets
 * @throws Error if assetA or assetB not found in utxo.assets
 */
export function decodePool(
  utxo: ChainUtxo,
  opts: {
    assetA: string;
    assetB: string;
    feeBasisPoints?: bigint;
  },
): VyFinancePool {
  const { assetA, assetB, feeBasisPoints = 30n } = opts;

  // Find reserves from utxo.assets
  const assetAEntry = utxo.assets.find((a) => a.unit === assetA);
  const assetBEntry = utxo.assets.find((a) => a.unit === assetB);

  if (!assetAEntry) {
    throw new Error(`Asset ${assetA} not found in UTxO assets`);
  }
  if (!assetBEntry) {
    throw new Error(`Asset ${assetB} not found in UTxO assets`);
  }

  const reserveA = assetAEntry.quantity;
  const reserveB = assetBEntry.quantity;

  // Generate poolId from assets (simple approach: use asset prefixes + hash)
  const poolId = `vyfinance-${assetA.slice(0, 16)}-${assetB.slice(0, 16)}`;

  return {
    poolId,
    assetA,
    assetB,
    reserveA,
    reserveB,
    feeBasisPoints,
  };
}
