import { constantProductSwap, computeSwapPriceImpactPct } from "../domain/amm";
import {
  LIVE_QUOTE_MAX_AGE_MS,
  LIVE_QUOTE_NETWORK,
  LIVE_QUOTE_TIMEOUT_MS,
  MINSWAP_AGGREGATOR_BASE_URL,
  MINSWAP_POOL_BASE_URL,
} from "../config/networks";
import { requireAsset } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterFailure, QuoteAdapterResult, QuoteAdapterSuccess } from "./types";
import { fetchWithRetry } from "./fetchUtils";

type MinswapPathHop = {
  lp_token?: string;
  token_in?: string;
  token_out?: string;
  protocol?: string;
};

type MinswapEstimateResponse = {
  paths?: unknown;
};

type PoolMetricsApiResponse = {
  type: string;
  asset_a: { currency_symbol: string; token_name: string };
  asset_b: { currency_symbol: string; token_name: string };
  liquidity_a: number;
  liquidity_b: number;
  trading_fee_tier: number[];
};

type PoolMetrics = {
  protocol: string;
  assetA: string;
  assetB: string;
  reserveA: number;
  reserveB: number;
  feeBpsAtoB: number;
  feeBpsBtoA: number;
};

const OWNED_MIN_PROTOCOLS = new Set(["Minswap", "MinswapV2"]);

export function minswapFeeTierToBps(feeTier: number): number {
  // Minswap metrics expose fee tiers as percentages, e.g. 0.3 for 0.3%.
  return feeTier * 100;
}

export function dottedLpToken(lpToken: string): string {
  return lpToken.includes(".") ? lpToken : `${lpToken.slice(0, 56)}.${lpToken.slice(56)}`;
}

export function minswapAssetUnit(asset: { currency_symbol: string; token_name: string }): string {
  return asset.currency_symbol ? `${asset.currency_symbol}${asset.token_name}` : "lovelace";
}

function failure(request: QuoteRequest, reason: QuoteAdapterFailure["reason"], message: string): QuoteAdapterFailure {
  return {
    ok: false,
    adapterId: minswapDiscoveredPoolAdapter.id,
    adapterName: minswapDiscoveredPoolAdapter.displayName,
    quoteMode: minswapDiscoveredPoolAdapter.quoteMode,
    network: LIVE_QUOTE_NETWORK,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    routeId: "minswap-discovered-pool-failure",
    label: "Minswap discovered pool",
    reason,
    message,
  };
}

async function discoverOwnedHop(request: QuoteRequest): Promise<MinswapPathHop | null> {
  const response = await fetchWithRetry(
    `${MINSWAP_AGGREGATOR_BASE_URL}/estimate`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        amount: String(request.amountIn),
        token_in: request.inputAssetId,
        token_out: request.outputAssetId,
        slippage: request.slippageTolerancePct,
        allow_multi_hops: false,
        amount_in_decimal: true,
      }),
    },
    LIVE_QUOTE_TIMEOUT_MS,
    1,
  );
  if (!response.ok) return null;
  const json = (await response.json()) as MinswapEstimateResponse;
  if (!Array.isArray(json.paths)) return null;

  for (const path of json.paths) {
    if (!Array.isArray(path) || path.length !== 1) continue;
    const hop = path[0] as MinswapPathHop;
    if (
      typeof hop.lp_token === "string" &&
      hop.token_in === request.inputAssetId &&
      hop.token_out === request.outputAssetId &&
      typeof hop.protocol === "string" &&
      OWNED_MIN_PROTOCOLS.has(hop.protocol)
    ) {
      return hop;
    }
  }

  return null;
}

async function fetchPoolMetrics(lpToken: string): Promise<PoolMetrics | null> {
  const response = await fetchWithRetry(
    `${MINSWAP_POOL_BASE_URL}/v1/pools/${dottedLpToken(lpToken)}/metrics`,
    { method: "GET", headers: { accept: "application/json" } },
    LIVE_QUOTE_TIMEOUT_MS,
    1,
  );
  if (!response.ok) return null;
  const json = (await response.json()) as PoolMetricsApiResponse;
  if (
    !OWNED_MIN_PROTOCOLS.has(json.type) ||
    !json.asset_a ||
    !json.asset_b ||
    typeof json.liquidity_a !== "number" ||
    typeof json.liquidity_b !== "number" ||
    !Array.isArray(json.trading_fee_tier) ||
    json.trading_fee_tier.length === 0
  ) {
    return null;
  }

  const feeA = json.trading_fee_tier[0] ?? json.trading_fee_tier[json.trading_fee_tier.length - 1];
  const feeB = json.trading_fee_tier[1] ?? feeA;
  return {
    protocol: json.type,
    assetA: minswapAssetUnit(json.asset_a),
    assetB: minswapAssetUnit(json.asset_b),
    reserveA: json.liquidity_a,
    reserveB: json.liquidity_b,
    feeBpsAtoB: minswapFeeTierToBps(feeA),
    feeBpsBtoA: minswapFeeTierToBps(feeB),
  };
}

export const minswapDiscoveredPoolAdapter = {
  id: "minswap-discovered-pool",
  displayName: "Minswap discovered pool",
  quoteMode: "live" as const,
  async getQuotes(request: QuoteRequest, now = new Date()): Promise<QuoteAdapterResult[]> {
    if (request.network !== LIVE_QUOTE_NETWORK) return [];

    try {
      const hop = await discoverOwnedHop(request);
      if (!hop?.lp_token || !hop.protocol) {
        return [failure(request, "unsupported_pair", "No direct Minswap/MinswapV2 pool was discovered for this pair.")];
      }

      const metrics = await fetchPoolMetrics(hop.lp_token);
      if (!metrics) {
        return [failure(request, "failed_source", "Minswap discovered pool metrics could not be fetched.")];
      }

      const isAtoB = request.inputAssetId === metrics.assetA && request.outputAssetId === metrics.assetB;
      const isBtoA = request.inputAssetId === metrics.assetB && request.outputAssetId === metrics.assetA;
      if (!isAtoB && !isBtoA) {
        return [failure(request, "failed_source", "Minswap metrics assets did not match the discovered route.")];
      }

      const inputAsset = requireAsset(request.inputAssetId);
      const [reserveIn, reserveOut, feeBps] = isAtoB
        ? [metrics.reserveA, metrics.reserveB, metrics.feeBpsAtoB]
        : [metrics.reserveB, metrics.reserveA, metrics.feeBpsBtoA];

      const grossOutput = constantProductSwap(request.amountIn, reserveIn, reserveOut, feeBps);
      const success: QuoteAdapterSuccess = {
        ok: true,
        adapterId: minswapDiscoveredPoolAdapter.id,
        adapterName: minswapDiscoveredPoolAdapter.displayName,
        quoteMode: minswapDiscoveredPoolAdapter.quoteMode,
        network: LIVE_QUOTE_NETWORK,
        inputAssetId: request.inputAssetId,
        outputAssetId: request.outputAssetId,
        routeId: `minswap-discovered-${request.inputAssetId}-${request.outputAssetId}`,
        label: `${metrics.protocol} discovered pool`,
        grossOutput,
        feeBreakdown: {
          dexFeeAda: request.amountIn * inputAsset.mockPriceAda * (feeBps / 10000),
          batcherFeeAda: 0,
          networkFeeAda: 0,
          aggregatorFeeAda: 0,
          minAdaRequirement: 0,
        },
        routeHops: [
          {
            venue: metrics.protocol,
            inputAssetId: request.inputAssetId,
            outputAssetId: request.outputAssetId,
          },
        ],
        quoteTimestamp: now.toISOString(),
        expiresAt: new Date(now.getTime() + LIVE_QUOTE_MAX_AGE_MS).toISOString(),
        maxAgeMs: LIVE_QUOTE_MAX_AGE_MS,
        executable: false,
        priceImpactPct: computeSwapPriceImpactPct(request.amountIn, reserveIn),
        confidencePct: 82,
        note: "Owned quote: pool discovered via Minswap route metadata, reserves and fee fetched from pool metrics, output computed locally.",
        poolReserveIn: reserveIn,
        poolReserveOut: reserveOut,
        poolFeeBps: feeBps,
      };

      return [success];
    } catch {
      return [failure(request, "failed_source", "Minswap discovered pool quote timed out or could not be fetched.")];
    }
  },
};
