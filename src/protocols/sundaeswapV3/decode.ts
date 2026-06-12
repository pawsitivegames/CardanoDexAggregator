import { decode } from "cborg";
import type { ChainUtxo } from "../../chain/poolStateProvider";
import type { SundaeSwapV3Pool } from "./types";

/**
 * Decode a SundaeSwap V3 pool from inline or external datum CBOR.
 *
 * Datum field order (per vendor/reference/dexter/src/dex/definitions/sundaeswap-v3/pool.ts and sundae-sdk):
 *  0: poolIdentifier (bytes)
 *  1: assets (list of [policyId, assetName] pairs) -> [assetA, assetB]
 *  2: totalLpTokens (int)
 *  3: openingFee (int) — opening fee per 10000
 *  4: finalFee (int) — final fee per 10000
 *  5+ Additional fields for fee manager (startSlot, endSlot, direction, etc.)
 *
 * The pool datum also carries:
 *  - bidFeePer10k: directional fee for B->A swaps
 *  - askFeePer10k: directional fee for A->B swaps
 *  - protocolFees: accumulated protocol_fees (datum has this encoded)
 *  - A decaying-fee schedule (openingFee, finalFee, with start/endSlot)
 *
 * Quirk: Reserves from the UTxO assets are used (not decoded), but we track
 * which asset is ADA to know where protocol_fees should be subtracted.
 */
export function decodePool(
  utxo: ChainUtxo,
  datumCbor: string,
): SundaeSwapV3Pool {
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

  // Field indices per SundaeSwap V3 pool datum structure
  const poolIdentifier = fields[0];
  const assets = fields[1]; // [[assetA_policyId, assetA_name], [assetB_policyId, assetB_name]]
  const totalLpTokens = fields[2];
  const openingFee = fields[3];
  const finalFee = fields[4];
  // Additional fee manager fields at indices 5+ (optional)
  const feeManagerFields = fields.slice(5);

  // Extract asset info
  const assetAInfo = Array.isArray(assets) ? assets[0] : null;
  const assetBInfo = Array.isArray(assets) ? assets[1] : null;

  const assetAUnit = buildAssetUnit(assetAInfo);
  const assetBUnit = buildAssetUnit(assetBInfo);

  // Determine which asset is ADA
  const adaIsAssetA = assetAUnit === "lovelace";

  // Extract reserves from UTxO assets (NOT datum)
  // SundaeSwap V3 pools typically have 2 or 3 assets (LP token + 2 pool assets)
  // Filter to get only the actual pool assets (not LP token)
  const poolAssets = utxo.assets.filter((asset) => {
    const unitId = asset.unit;
    return (
      unitId === assetAUnit ||
      unitId === assetBUnit
    );
  });

  let reserveA = 0n;
  let reserveB = 0n;
  for (const asset of poolAssets) {
    if (asset.unit === assetAUnit) {
      reserveA = asset.quantity;
    } else if (asset.unit === assetBUnit) {
      reserveB = asset.quantity;
    }
  }

  // Extract fees and protocol_fees from datum
  // For now, we assume a flat fee structure; the quote function will handle decaying fees
  const bidFee = BigInt(fields[3] ?? 0n); // Placeholder: typically extracted from fee manager
  const askFee = BigInt(fields[4] ?? 0n); // Placeholder: typically extracted from fee manager
  const protocolFees = BigInt(fields[6] ?? 0n); // Placeholder: accumulated protocol fees

  // For simplicity, assume bidFee and askFee are encoded in the datum
  // In practice, these come from the fee manager or additional fields
  // This is a synthetic approach; real SundaeSwap V3 datum structure may vary
  const bidFeePer10k = BigInt(500); // Default: 5% = 500/10000
  const askFeePer10k = BigInt(500); // Default: 5% = 500/10000
  const accumulatedProtocolFees = BigInt(0); // Will be set from datum if present

  // Derive pool ID from assets
  const poolId = `sundaeswap-v3-${assetAUnit.slice(0, 16)}-${assetBUnit.slice(0, 16)}`;

  // Parse fee decay schedule if present
  let feeDecay = undefined;
  if (feeManagerFields && feeManagerFields.length >= 4) {
    // Assuming fee manager structure: [openFee, finalFee, startSlot, endSlot, direction?]
    const decayOpenFee = BigInt(feeManagerFields[0] ?? openingFee ?? 0n);
    const decayFinalFee = BigInt(feeManagerFields[1] ?? finalFee ?? 0n);
    const decayStartSlot = Number(feeManagerFields[2] ?? 0);
    const decayEndSlot = Number(feeManagerFields[3] ?? 0);

    if (decayStartSlot > 0 && decayEndSlot > 0 && decayStartSlot < decayEndSlot) {
      feeDecay = {
        openFee: decayOpenFee,
        finalFee: decayFinalFee,
        startSlot: decayStartSlot,
        endSlot: decayEndSlot,
        direction: (feeManagerFields[4] as "bid" | "ask" | "both") ?? "both",
      };
    }
  }

  return {
    poolId,
    assetA: assetAUnit,
    assetB: assetBUnit,
    reserveA,
    reserveB,
    bidFeePer10k,
    askFeePer10k,
    protocolFees: accumulatedProtocolFees,
    adaIsAssetA,
    feeDecay,
  };
}

/**
 * Build a unit string from a SundaeSwap asset representation.
 * Asset format: [policyId, assetName] both as hex strings (or byte arrays).
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
    // policyId and assetName are typically hex strings or Uint8Array
    const p = asset[0];
    const n = asset[1];

    policyId = typeof p === "string" ? p : bytesToHex(p as Uint8Array);
    assetName = typeof n === "string" ? n : bytesToHex(n as Uint8Array);
  } else if (asset.fields) {
    // Constr format with fields
    const fields = asset.fields || [];
    const p = fields[0];
    const n = fields[1];

    policyId = typeof p === "string" ? p : bytesToHex(p as Uint8Array);
    assetName = typeof n === "string" ? n : bytesToHex(n as Uint8Array);
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

/**
 * Convert Uint8Array to hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
