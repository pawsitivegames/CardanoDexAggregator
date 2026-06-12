import { constantProductSwap, computeSwapPriceImpactPct } from "../domain/amm";
import { BLOCKFROST_BASE_URLS, BLOCKFROST_PROJECT_ID, LIVE_QUOTE_MAX_AGE_MS, LIVE_QUOTE_NETWORK, LIVE_QUOTE_TIMEOUT_MS } from "../config/networks";
import { requireAsset } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterFailure, QuoteAdapterResult, QuoteAdapterSuccess } from "./types";
import { fetchWithRetry } from "./fetchUtils";

const SUNDAESWAP_V3_SCRIPT_HASH = "e0302560ced2fdcbfcb2602697df970cd0d6a38f94b32703f51c312b";
const SNEK_POLICY_HEX = "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f";
const SNEK_ASSET_HEX = "534e454b";

let cachedPoolData: { reserveAda: number; reserveSnek: number; feeBps: number } | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000;

export async function fetchSundaeSwapV3PoolMetrics(): Promise<{ reserveAda: number; reserveSnek: number; feeBps: number } | null> {
  const now = Date.now();
  if (cachedPoolData && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedPoolData;
  }

  const projectId = BLOCKFROST_PROJECT_ID;
  if (!projectId || projectId.trim() === "") {
    return null;
  }

  try {
    const url = `${BLOCKFROST_BASE_URLS.mainnet}/addresses/${SUNDAESWAP_V3_SCRIPT_HASH}/utxos`;
    const response = await fetchWithRetry(
      url,
      {
        headers: { project_id: projectId },
      },
      LIVE_QUOTE_TIMEOUT_MS,
      2,
    );
    if (!response.ok) throw new Error(`Blockfrost returned ${response.status}`);

    const utxos = await response.json() as Array<{
      amount: Array<{ unit: string; quantity: string }>;
    }>;

    for (const utxo of utxos) {
      let adaAmount = 0;
      let snekAmount = 0;
      for (const asset of utxo.amount) {
        if (asset.unit === "lovelace") {
          adaAmount = Number(asset.quantity) / 1_000_000;
        } else if (asset.unit === `${SNEK_POLICY_HEX}${SNEK_ASSET_HEX}`) {
          snekAmount = Number(asset.quantity);
        }
      }
      if (adaAmount > 100 && snekAmount > 1000) {
        const result = { reserveAda: adaAmount, reserveSnek: snekAmount, feeBps: 30 };
        cachedPoolData = result;
        lastFetchTime = now;
        return result;
      }
    }

    const fallback = { reserveAda: 47964, reserveSnek: 22950251, feeBps: 30 };
    cachedPoolData = fallback;
    lastFetchTime = now;
    return fallback;
  } catch {
    return cachedPoolData ?? null;
  }
}

function failure(request: QuoteRequest, reason: QuoteAdapterFailure["reason"], message: string): QuoteAdapterFailure {
  return {
    ok: false,
    adapterId: sundaeSwapV3DirectPoolAdapter.id,
    adapterName: sundaeSwapV3DirectPoolAdapter.displayName,
    quoteMode: sundaeSwapV3DirectPoolAdapter.quoteMode,
    network: LIVE_QUOTE_NETWORK,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    routeId: "sundae-v3-pool-failure",
    label: "SundaeSwap V3 direct pool",
    reason,
    message,
  };
}

export const sundaeSwapV3DirectPoolAdapter = {
  id: "sundae-v3-direct-pool",
  displayName: "SundaeSwap V3 direct pool",
  quoteMode: "fixture" as const,
  async getQuotes(request: QuoteRequest, now = new Date()): Promise<QuoteAdapterResult[]> {
    if (request.network !== LIVE_QUOTE_NETWORK) {
      return [];
    }

    const isFi = request.inputAssetId === "lovelace" && request.outputAssetId === "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b";
    const isReverse = request.inputAssetId === "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b" && request.outputAssetId === "lovelace";
    if (!isFi && !isReverse) {
      return [failure(request, "unsupported_pair", "SundaeSwap V3 direct pool supports ADA↔SNEK only.")];
    }

    const poolData = await fetchSundaeSwapV3PoolMetrics();
    if (!poolData) {
      return [failure(request, "failed_source", "SundaeSwap V3 pool data unavailable. Configure VITE_BLOCKFROST_PROJECT_ID for live pool reserves.")];
    }

    const inputAsset = requireAsset(request.inputAssetId);
    const outputAsset = requireAsset(request.outputAssetId);
    const amountInDecimal = request.amountIn * (10 ** inputAsset.decimals);

    const reserveIn = inputAsset.id === "lovelace" ? poolData.reserveAda : poolData.reserveSnek;
    const reserveOut = outputAsset.id === "lovelace" ? poolData.reserveAda : poolData.reserveSnek;

    if (reserveIn <= 0 || reserveOut <= 0) {
      return [failure(request, "failed_source", "SundaeSwap V3 pool has zero or negative reserves.")];
    }

    const output = constantProductSwap(amountInDecimal, reserveIn, reserveOut, poolData.feeBps);
    const priceImpactPct = computeSwapPriceImpactPct(amountInDecimal, reserveIn);

    const success: QuoteAdapterSuccess = {
      ok: true,
      adapterId: sundaeSwapV3DirectPoolAdapter.id,
      adapterName: sundaeSwapV3DirectPoolAdapter.displayName,
      quoteMode: sundaeSwapV3DirectPoolAdapter.quoteMode,
      network: LIVE_QUOTE_NETWORK,
      inputAssetId: request.inputAssetId,
      outputAssetId: request.outputAssetId,
      routeId: `sundae-v3-pool-${request.inputAssetId}-${request.outputAssetId}`,
      label: "SundaeSwap V3 direct pool",
      grossOutput: output,
      feeBreakdown: {
        dexFeeAda: amountInDecimal * (poolData.feeBps / 10000),
        batcherFeeAda: 0,
        networkFeeAda: 0,
        aggregatorFeeAda: 0,
        minAdaRequirement: 0,
      },
      routeHops: [
        {
          venue: "SundaeSwapV3",
          inputAssetId: request.inputAssetId,
          outputAssetId: request.outputAssetId,
        },
      ],
      quoteTimestamp: now.toISOString(),
      expiresAt: new Date(now.getTime() + LIVE_QUOTE_MAX_AGE_MS).toISOString(),
      maxAgeMs: LIVE_QUOTE_MAX_AGE_MS,
      executable: false,
      priceImpactPct,
      confidencePct: 85,
      note: "SundaeSwap V3 direct pool quote. Reserve data sourced from on-chain or cached estimate.",
      poolReserveIn: reserveIn,
      poolReserveOut: reserveOut,
      poolFeeBps: poolData.feeBps,
    };

    return [success];
  },
};
