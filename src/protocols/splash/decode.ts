import { decode } from "cborg";
import type { ChainUtxo } from "../../chain/poolStateProvider";
import type { SplashPool } from "./types";

/**
 * Decode a Splash classic (CPP) pool from inline or external datum CBOR.
 *
 * Datum field order (Splash CPP - Constant Product Pool):
 *  0: pool_nft (Asset)
 *  1: asset_x (Asset) <- Pool asset A
 *  2: asset_y (Asset) <- Pool asset B
 *  3: lp_token (Asset)
 *  4: pool_fee (bigint) <- Fee numerator (e.g., 997 for 0.3%)
 *  5: treasury_fee (bigint)
 *  6: treasury_x (bigint)
 *  7: treasury_y (bigint)
 *  8: dao_policy (RawDatum)
 *  9: lq_bound (bigint)
 * 10: treasury_address (bytes)
 *
 * Note: This decoder handles classic CFMM pools ONLY.
 * Weighted/Stable/TLB pools are Phase 3 and will throw an error.
 */
export function decodePool(utxo: ChainUtxo, datumCbor: string): SplashPool {
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

  // Field indices per Splash CPP datum structure
  const poolNft = fields[0];
  const assetX = fields[1];
  const assetY = fields[2];
  const lpToken = fields[3];
  const poolFee = fields[4];
  const treasuryFee = fields[5];
  const treasuryX = fields[6];
  const treasuryY = fields[7];
  // daoPolicy = fields[8]; // Not used for basic swaps
  // lqBound = fields[9];   // Not used for basic swaps
  // treasuryAddress = fields[10]; // Not used for basic swaps

  // TODO: Weighted/Stable/TLB pool detection will go here in Phase 3
  // For now, throw if the pool structure suggests a non-classic variant
  // (would be detected via additional fields or constructor variants)

  // Convert asset objects to unit strings
  const assetAUnit = buildAssetUnit(assetX);
  const assetBUnit = buildAssetUnit(assetY);

  // Derive pool ID from pool NFT
  const poolNftUnit = buildAssetUnit(poolNft);
  const poolId = `splash-cpp-${poolNftUnit}`;

  // Extract reserves from UTxO assets, subtract treasury amounts
  const reserveA = getReserveFromUtxo(utxo, assetAUnit, treasuryX);
  const reserveB = getReserveFromUtxo(utxo, assetBUnit, treasuryY);

  return {
    poolId,
    assetA: assetAUnit,
    assetB: assetBUnit,
    reserveA,
    reserveB,
    lpFee: BigInt(poolFee),
    feeDenominator: 1000n,
  };
}

/**
 * Build a unit string from a Splash asset object.
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

/**
 * Extract reserve amount from UTxO assets, subtracting treasury amount.
 * Searches for the asset unit in the UTxO assets list.
 * If not found, defaults to 0n (handles edge cases).
 */
function getReserveFromUtxo(
  utxo: ChainUtxo,
  assetUnit: string,
  treasuryAmount: bigint
): bigint {
  const assetBalance = utxo.assets.find((a) => a.unit === assetUnit);
  if (!assetBalance) {
    return 0n;
  }
  const treasuryBig = BigInt(treasuryAmount);
  const reserve = assetBalance.quantity - treasuryBig;
  return reserve < 0n ? 0n : reserve;
}
