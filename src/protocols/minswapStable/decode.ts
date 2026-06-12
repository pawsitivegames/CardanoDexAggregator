import { decode } from "cborg";
import type { ChainUtxo } from "../../chain/poolStateProvider";
import type { MinswapStablePool } from "./types";

/**
 * Decode a Minswap Stableswap pool from inline or external datum CBOR.
 *
 * Datum field order (per vendor/reference/minswap-stableswap/lib/stableswap/types.ak):
 *  0: balances (List<Int>)
 *  1: total_liquidity (Int)
 *  2: amp (Int) - Amplification coefficient A
 *  3: order_hash (ValidatorHash) - not used for swaps
 *
 * Additional context from PoolParams (lib/stableswap/types.ak):
 *  - assets: list of Asset items (from PoolParams, not datum)
 *  - multiples: list of scaling factors (from PoolParams, not datum)
 *  - fee: trading fee numerator (from PoolParams)
 *  - fee_denominator: denominator (from PoolParams)
 *
 * In practice, pools are fetched with both datum and params (via reference script or config).
 * For simplicity, this decoder accepts balances/amp from datum and expects the full pool
 * to be provided separately (or we decode from a synthetic combined datum).
 *
 * For testing, we'll use fixture pools that include all required fields.
 * For production, the AggregatorLiveAdapter will combine datum + params.
 */
export function decodePool(utxo: ChainUtxo, datumCbor: string): Omit<MinswapStablePool, 'poolId'> {
  const hexToBytes = (hex: string): Uint8Array => {
    if (hex.length % 2 !== 0) {
      throw new Error("Invalid hex string: odd length");
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  };

  const datum = decode(hexToBytes(datumCbor)) as any;

  // Extract fields from datum
  const fields = datum.fields || datum;
  if (!Array.isArray(fields)) {
    throw new Error("Invalid datum structure: expected array-like fields");
  }

  // Parse datum fields
  const balances = (fields[0] as number[]).map(b => BigInt(b));
  const totalLiquidity = BigInt(fields[1]);
  const amp = BigInt(fields[2]);
  // const orderHash = fields[3]; // not needed for quote math

  // Note: In production, assets and multiples would come from the pool config/params.
  // For this decoder, we return the core fields and expect callers to provide assets/multiples.
  return {
    balances,
    amp,
    assets: [], // to be filled in by caller
    multiples: [], // to be filled in by caller
    tradeFeeNumerator: 0n, // to be filled in by caller
    feeDenominator: 0n, // to be filled in by caller
  };
}
