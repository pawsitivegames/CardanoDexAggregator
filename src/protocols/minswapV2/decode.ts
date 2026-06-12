import { decode } from "cborg";
import type { ChainUtxo } from "../../chain/poolStateProvider";
import type { MinswapV2Pool } from "./types";

/**
 * Decode a Minswap V2 pool from inline or external datum CBOR.
 *
 * Datum field order (per vendor/reference/minswap-dex-v2/src/types/pool.ts):
 *  0: poolBatchingStakeCredential (Credential)
 *  1: assetA (Asset)
 *  2: assetB (Asset)
 *  3: totalLiquidity (bigint)
 *  4: reserveA (bigint) <- THE source of truth for reserves, NOT utxo.assets
 *  5: reserveB (bigint) <- THE source of truth for reserves, NOT utxo.assets
 *  6: baseFeeANumerator (bigint)
 *  7: baseFeeBNumerator (bigint)
 *  8: feeSharingNumerator (Option<bigint>)
 *  9: allowDynamicFee (bool)
 *
 * Formula reference: vendor/reference/minswap-dex-v2/amm-v2-docs/formula.md
 * Swap Exact In: Δy = ((f_d - f_n) * Δx * y0) / (x0 * f_d + (f_d - f_n) * Δx)
 * with f_d = 10000, f_n = per-direction fee numerator
 */
export function decodePool(utxo: ChainUtxo, datumCbor: string): MinswapV2Pool {
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

  // Datum is a Constr (constructor) type at top level
  // Extract fields from the array-like structure
  const fields = datum.fields || datum;
  if (!Array.isArray(fields)) {
    throw new Error("Invalid datum structure: expected array-like fields");
  }

  // Field indices per pool.ts toPlutus order
  const poolBatchingStakeCredential = fields[0];
  const assetA = fields[1];
  const assetB = fields[2];
  const totalLiquidity = fields[3];
  const reserveA = fields[4];
  const reserveB = fields[5];
  const baseFeeANumerator = fields[6];
  const baseFeeBNumerator = fields[7];
  // feeSharingNumerator = fields[8]; // Not used for swaps
  // allowDynamicFee = fields[9]; // Not used for static math

  // Convert asset objects to unit strings
  // Minswap assets are [policyId (hex string), assetName (hex string)]
  const assetAUnit = buildAssetUnit(assetA);
  const assetBUnit = buildAssetUnit(assetB);

  // Derive pool ID from LP token (policy + name)
  // For now, use a simple hash or combination
  const poolId = `minswap-v2-${assetAUnit.slice(0, 16)}-${assetBUnit.slice(0, 16)}`;

  return {
    poolId,
    assetA: assetAUnit,
    assetB: assetBUnit,
    reserveA: BigInt(reserveA),
    reserveB: BigInt(reserveB),
    baseFeeANumerator: BigInt(baseFeeANumerator),
    baseFeeBNumerator: BigInt(baseFeeBNumerator),
    feeDenominator: 10000n,
  };
}

/**
 * Build a unit string from a Minswap asset object.
 * Asset format: [policyId, assetName] both as hex strings.
 * "lovelace" if policyId is empty or null.
 */
function buildAssetUnit(asset: any): string {
  if (!asset) {
    return "lovelace";
  }

  // Handle both [policyId, assetName] and {policyId, tokenName} formats
  let policyId: string;
  let assetName: string;

  if (Array.isArray(asset)) {
    // Array format: [policyId, assetName]
    policyId = asset[0] || "";
    assetName = asset[1] || "";
  } else if (asset.fields) {
    // Constr format with fields
    const fields = asset.fields || [];
    policyId = fields[0] || "";
    assetName = fields[1] || "";
  } else {
    // Object format: {policyId, tokenName}
    policyId = asset.policyId || asset.currency_symbol || "";
    assetName = asset.tokenName || asset.token_name || "";
  }

  if (!policyId || policyId === "") {
    return "lovelace";
  }

  return policyId + assetName;
}
