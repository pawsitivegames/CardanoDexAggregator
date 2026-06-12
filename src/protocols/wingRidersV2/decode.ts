import { decode } from "cborg";
import type { ChainUtxo } from "../../chain/poolStateProvider";
import type { WingRidersV2Pool } from "./types";

/**
 * Decode a WingRiders V2 pool from inline or external datum CBOR.
 *
 * Datum field order (per vendor/reference/wingriders-dex-serializer/src/LiquidityPoolDatumV2.ts):
 *  0: requestValidatorHash (ScriptHash bytes)
 *  1: assetA policy id (bytes)
 *  2: assetA asset name (bytes)
 *  3: assetB policy id (bytes)
 *  4: assetB asset name (bytes)
 *  5: swapFeeInBasis (bigint) <- Fee in basis points (e.g., 35 = 0.35%)
 *  6: protocolFeeInBasis (bigint)
 *  7: projectFeeInBasis (bigint)
 *  8: feeBasis (bigint) <- denominator (typically 10000)
 *  9: agentFeeAda (bigint)
 * 10: lastInteraction (bigint)
 * 11: treasuryA (bigint)
 * 12: treasuryB (bigint)
 * 13+: projectTreasury and other fields (not used for quote math)
 *
 * CRITICAL: True reserves must account for:
 *   trueReserveA = reserveA - treasuryA - (adaIsAssetA ? stakingRewardsAda : 0)
 *   trueReserveB = reserveB - treasuryB - (adaIsAssetB ? stakingRewardsAda : 0)
 * Quote against TRUE reserves, not raw datum reserves.
 */
export function decodePool(
  utxo: ChainUtxo,
  datumCbor: string,
  stakingRewardsAda: bigint = 0n,
): WingRidersV2Pool {
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
  const fields = datum.fields || datum;
  if (!Array.isArray(fields)) {
    throw new Error("Invalid datum structure: expected array-like fields");
  }

  // Extract fields per WingRiders V2 datum order
  const assetAPolicyId = fields[1]; // bytes
  const assetAName = fields[2]; // bytes
  const assetBPolicyId = fields[3]; // bytes
  const assetBName = fields[4]; // bytes
  const feeBasisPoints = fields[5]; // swap fee in basis points
  const treasuryA = fields[11]; // bigint
  const treasuryB = fields[12]; // bigint

  // Convert asset objects to unit strings
  const assetAUnit = buildAssetUnit(assetAPolicyId || "", assetAName || "");
  const assetBUnit = buildAssetUnit(assetBPolicyId || "", assetBName || "");

  // Determine which asset is ADA
  const adaIsAssetA = assetAUnit === "lovelace";
  const adaIsAssetB = assetBUnit === "lovelace";

  // Extract reserves from UTxO assets (datum reserves are NOT used; UTxO value is)
  let reserveA = 0n;
  let reserveB = 0n;

  for (const asset of utxo.assets) {
    if (asset.unit === assetAUnit) {
      reserveA = asset.quantity;
    } else if (asset.unit === assetBUnit) {
      reserveB = asset.quantity;
    }
  }

  // Derive pool ID from assets
  const poolId = `wingriders-v2-${assetAUnit.slice(0, 16)}-${assetBUnit.slice(0, 16)}`;

  return {
    poolId,
    assetA: assetAUnit,
    assetB: assetBUnit,
    reserveA,
    reserveB,
    treasuryA: BigInt(treasuryA),
    treasuryB: BigInt(treasuryB),
    stakingRewardsAda,
    feeBasisPoints: BigInt(feeBasisPoints),
    adaIsAssetA,
    adaIsAssetB,
  };
}

/**
 * Build a unit string from WingRiders asset components.
 * Returns "lovelace" if policyId is empty/falsy.
 * Otherwise returns policyId + assetName as hex concatenation.
 */
function buildAssetUnit(policyIdHex: string | Uint8Array | Buffer | null | undefined, assetNameHex: string | Uint8Array | Buffer | null | undefined): string {
  // Convert to hex strings if Uint8Array or Buffer
  let policyId: string;
  let assetName: string;

  if (typeof policyIdHex === "string") {
    policyId = policyIdHex;
  } else if (policyIdHex && (policyIdHex instanceof Uint8Array || Buffer.isBuffer(policyIdHex as any))) {
    policyId = Buffer.from(policyIdHex as any).toString("hex");
  } else {
    policyId = "";
  }

  if (typeof assetNameHex === "string") {
    assetName = assetNameHex;
  } else if (assetNameHex && (assetNameHex instanceof Uint8Array || Buffer.isBuffer(assetNameHex as any))) {
    assetName = Buffer.from(assetNameHex as any).toString("hex");
  } else {
    assetName = "";
  }

  if (!policyId || policyId === "") {
    return "lovelace";
  }

  return policyId + assetName;
}
