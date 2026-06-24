import { decode } from "cborg";
import type { ChainUtxo } from "../../chain/poolStateProvider";
import type { MuesliSwapPool } from "./types";

/**
 * Decode a MuesliSwap pool from inline or external datum CBOR.
 *
 * Datum field order (per vendor/reference/dexter/src/dex/definitions/muesliswap/pool.ts):
 *  0: assetA (Constr with policyId, assetName)
 *  1: assetB (Constr with policyId, assetName)
 *  2: totalLpTokens (bigint)
 *  3: lpFee (bigint, basis points e.g. 30 = 0.3%)
 *
 * Reserves are extracted from the datum as a Minswap-style CFMM.
 * Fees are interpreted as: feeNumerator = lpFee (in basis points), feeDenominator = 10000
 */
export function decodePool(utxo: ChainUtxo, datumCbor: string): MuesliSwapPool {
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

  // Field indices per pool.ts: assetA, assetB, totalLpTokens, lpFee
  const assetA = fields[0];
  const assetB = fields[1];
  const totalLpTokens = fields[2];
  const lpFee = fields[3];

  // Convert asset objects to unit strings
  const assetAUnit = buildAssetUnit(assetA);
  const assetBUnit = buildAssetUnit(assetB);

  // Derive pool ID from asset combination
  const poolId = `muesliswap-${assetAUnit.slice(0, 16)}-${assetBUnit.slice(0, 16)}`;

  // For MuesliSwap, we need to extract reserves from the UTxO assets
  // since the datum only stores asset definitions, not reserves directly.
  // We use a simplified approach: extract reserves from the UTxO's asset list
  const reserveA = extractReserveFromAssets(utxo, assetAUnit);
  const reserveB = extractReserveFromAssets(utxo, assetBUnit);

  return {
    poolId,
    assetA: assetAUnit,
    assetB: assetBUnit,
    reserveA,
    reserveB,
    feeNumerator: BigInt(lpFee),
    feeDenominator: 10000n,
  };
}

/**
 * Build a unit string from a MuesliSwap asset object.
 * Asset format: Constr with fields [policyId, assetName] both as hex strings.
 * "lovelace" if policyId is empty or null.
 */
function buildAssetUnit(asset: any): string {
  if (!asset) {
    return "lovelace";
  }

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
    // Object format fallback
    policyId = asset.policyId || asset.currency_symbol || "";
    assetName = asset.tokenName || asset.token_name || "";
  }

  if (!policyId || policyId === "") {
    return "lovelace";
  }

  return policyId + assetName;
}

/**
 * Extract the reserve quantity for an asset from the UTxO's assets list.
 * Matches by unit string.
 */
function extractReserveFromAssets(utxo: ChainUtxo, assetUnit: string): bigint {
  if (assetUnit === "lovelace") {
    // Find lovelace in assets
    const lovelaceAsset = utxo.assets.find((a) => a.unit === "lovelace");
    return lovelaceAsset ? lovelaceAsset.quantity : 0n;
  }

  // Find the asset by unit
  const asset = utxo.assets.find((a) => a.unit === assetUnit);
  if (!asset) {
    throw new Error(`Asset ${assetUnit} not found in UTxO`);
  }

  return asset.quantity;
}
