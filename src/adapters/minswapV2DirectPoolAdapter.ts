import { constantProductSwap, computeSwapPriceImpactPct } from "../domain/amm";
import {
  FIRST_LIVE_PAIR,
  LIVE_QUOTE_MAX_AGE_MS,
  LIVE_QUOTE_NETWORK,
  LIVE_QUOTE_TIMEOUT_MS,
  MINSWAP_POOL_BASE_URL,
} from "../config/networks";
import { requireAsset } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterFailure, QuoteAdapterResult, QuoteAdapterSuccess } from "./types";
import { fetchWithRetry } from "./fetchUtils";
import { minswapFeeTierToBps } from "./minswapDiscoveredPoolAdapter";

const MINSWAP_V2_ADA_SNEK_LP_ASSET = "f5808c2c990d86da54bfc97d89cee6efa20cd8461616359478d96b4c.2ffadbb87144e875749122e0bbb9f535eeaa7f5660c6c4a91bcc4121e477f08d";

type PoolMetricsResponse = {
  liquidity_a: number;
  liquidity_b: number;
  trading_fee_tier: number[];
  type: string;
};

type PoolMetricsApiResponse = {
  lp_asset: { currency_symbol: string; token_name: string };
  type: string;
  asset_a: { currency_symbol: string; token_name: string; metadata?: { decimals: number; name: string; ticker: string } };
  asset_b: { currency_symbol: string; token_name: string; metadata?: { decimals: number; name: string; ticker: string } };
  liquidity: number;
  liquidity_a: number;
  liquidity_b: number;
  trading_fee_tier: number[];
};

function failure(request: QuoteRequest, reason: QuoteAdapterFailure["reason"], message: string): QuoteAdapterFailure {
  return {
    ok: false,
    adapterId: minswapV2DirectPoolAdapter.id,
    adapterName: minswapV2DirectPoolAdapter.displayName,
    quoteMode: minswapV2DirectPoolAdapter.quoteMode,
    network: LIVE_QUOTE_NETWORK,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    routeId: "minswap-v2-pool-failure",
    label: "Minswap V2 direct pool",
    reason,
    message,
  };
}


export async function fetchMinswapV2PoolMetrics(): Promise<PoolMetricsResponse | null> {
  try {
    const url = `${MINSWAP_POOL_BASE_URL}/v1/pools/${MINSWAP_V2_ADA_SNEK_LP_ASSET}/metrics`;
    const response = await fetchWithRetry(url, { method: "GET" }, LIVE_QUOTE_TIMEOUT_MS, 2);
    if (!response.ok) return null;
    const json = (await response.json()) as PoolMetricsApiResponse;
    if (json.type !== "MinswapV2" || !json.trading_fee_tier || json.trading_fee_tier.length === 0) return null;
    return {
      liquidity_a: json.liquidity_a,
      liquidity_b: json.liquidity_b,
      trading_fee_tier: json.trading_fee_tier,
      type: json.type,
    };
  } catch {
    return null;
  }
}

export const minswapV2DirectPoolAdapter = {
  id: "minswap-v2-direct-pool",
  displayName: "Minswap V2 direct pool",
  quoteMode: "live" as const,
  async getQuotes(request: QuoteRequest, now = new Date()): Promise<QuoteAdapterResult[]> {
    if (request.network !== LIVE_QUOTE_NETWORK) {
      return [];
    }

    if (request.inputAssetId !== FIRST_LIVE_PAIR.inputAssetId || request.outputAssetId !== FIRST_LIVE_PAIR.outputAssetId) {
      return [failure(request, "unsupported_pair", "Minswap V2 direct pool currently supports ADA to SNEK only.")];
    }

    const poolData = await fetchMinswapV2PoolMetrics();
    if (!poolData) {
      return [failure(request, "failed_source", "Minswap V2 pool metrics could not be fetched.")];
    }

    const inputAsset = requireAsset(request.inputAssetId);
    const outputAsset = requireAsset(request.outputAssetId);
    const amountInPoolUnits = request.amountIn;

    const reserveIn = inputAsset.id === "lovelace" ? poolData.liquidity_a : poolData.liquidity_b;
    const reserveOut = outputAsset.id === "lovelace" ? poolData.liquidity_a : poolData.liquidity_b;
    const feeBps = minswapFeeTierToBps(poolData.trading_fee_tier[0]);

    if (reserveIn <= 0 || reserveOut <= 0) {
      return [failure(request, "failed_source", "Minswap V2 pool has zero or negative reserves.")];
    }

    const output = constantProductSwap(amountInPoolUnits, reserveIn, reserveOut, feeBps);
    const priceImpactPct = computeSwapPriceImpactPct(amountInPoolUnits, reserveIn);

    const success: QuoteAdapterSuccess = {
      ok: true,
      adapterId: minswapV2DirectPoolAdapter.id,
      adapterName: minswapV2DirectPoolAdapter.displayName,
      quoteMode: minswapV2DirectPoolAdapter.quoteMode,
      network: LIVE_QUOTE_NETWORK,
      inputAssetId: request.inputAssetId,
      outputAssetId: request.outputAssetId,
      routeId: `minswap-v2-pool-${request.inputAssetId}-${request.outputAssetId}`,
      label: "Minswap V2 direct pool",
      grossOutput: output,
      feeBreakdown: {
        dexFeeAda: request.amountIn * inputAsset.mockPriceAda * (feeBps / 10000),
        batcherFeeAda: 0,
        networkFeeAda: 0,
        aggregatorFeeAda: 0,
        minAdaRequirement: 0,
      },
      routeHops: [
        {
          venue: "MinswapV2",
          inputAssetId: request.inputAssetId,
          outputAssetId: request.outputAssetId,
        },
      ],
      quoteTimestamp: now.toISOString(),
      expiresAt: new Date(now.getTime() + LIVE_QUOTE_MAX_AGE_MS).toISOString(),
      maxAgeMs: LIVE_QUOTE_MAX_AGE_MS,
      executable: false,
      priceImpactPct,
      confidencePct: 92,
      note: "Minswap V2 direct pool quote from on-chain reserves via Minswap API.",
      poolReserveIn: reserveIn,
      poolReserveOut: reserveOut,
      poolFeeBps: feeBps,
    };

    return [success];
  },
};
