// Helper for our on-chain router: builds legs, runs the splitter, and converts to human units.

import { buildLegs } from "../router/routeGraph";
import { routeSplit } from "../router/splitRouter";
import type { PoolRegistry } from "../protocols/registry/registry";
import { getAsset, LOVELACE_ASSET_ID } from "../domain/assets";

/**
 * Quote via our router: builds all legs for the pair, runs the split algorithm,
 * and returns the net output in human (decimal-adjusted) units of the output asset.
 * Returns 0 if the pair is unsupported or any step fails.
 */
export function quoteViaRouter(
  registry: PoolRegistry,
  inputAssetId: string,
  outputAssetId: string,
  amountInAda: number,
): number {
  try {
    // Get the input and output asset metadata.
    const inputAsset =
      inputAssetId === LOVELACE_ASSET_ID
        ? { id: LOVELACE_ASSET_ID, symbol: "ADA", decimals: 6 }
        : getAsset(inputAssetId);
    const outputAsset = getAsset(outputAssetId);

    if (!inputAsset || !outputAsset) {
      return 0;
    }

    // Convert human ADA to smallest units (lovelace).
    const amountInLovelace = BigInt(Math.floor(amountInAda * 1_000_000));
    if (amountInLovelace <= 0n) {
      return 0;
    }

    // Build all legs for this pair.
    const legs = buildLegs(registry, inputAssetId, outputAssetId);
    if (legs.length === 0) {
      return 0;
    }

    // Run the split algorithm.
    const result = routeSplit(legs, amountInLovelace);

    // Convert net output from smallest units to human units using output asset decimals.
    const humanOutput = Number(result.netOutput) / Math.pow(10, outputAsset.decimals);
    return humanOutput;
  } catch {
    return 0;
  }
}
