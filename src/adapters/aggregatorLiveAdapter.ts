import {
  FIRST_LIVE_PAIR,
  LIVE_QUOTE_MAX_AGE_MS,
  LIVE_QUOTE_NETWORK,
  LIVE_QUOTE_TIMEOUT_MS,
  MINSWAP_AGGREGATOR_BASE_URL,
} from "../config/networks";
import { requireAsset } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterFailure, QuoteAdapterResult, QuoteAdapterSuccess } from "./types";
import { fetchWithRetry, asNumber } from "./fetchUtils";

export type AggregatorAdapterConfig = {
  id: string;
  displayName: string;
  protocol: string;
  pair: {
    inputAssetId: string;
    outputAssetId: string;
  };
};

type AggregatorPath = {
  protocol?: unknown;
  token_in?: unknown;
  token_out?: unknown;
  lp_fee?: unknown;
  dex_fee?: unknown;
  deposits?: unknown;
  price_impact?: unknown;
};

export type AggregatorEstimateResponse = {
  token_in?: unknown;
  token_out?: unknown;
  amount_in?: unknown;
  amount_out?: unknown;
  min_amount_out?: unknown;
  total_lp_fee?: unknown;
  total_dex_fee?: unknown;
  deposits?: unknown;
  avg_price_impact?: unknown;
  paths?: unknown;
  aggregator_fee?: unknown;
  amount_in_decimal?: unknown;
};

function firstPath(response: AggregatorEstimateResponse): AggregatorPath[] | undefined {
  if (!Array.isArray(response.paths) || response.paths.length === 0) return undefined;
  const path = response.paths[0];
  if (!Array.isArray(path) || path.length === 0) return undefined;
  return path as AggregatorPath[];
}


export function createAggregatorLiveAdapter(config: AggregatorAdapterConfig) {
  const failure = (
    request: QuoteRequest,
    reason: QuoteAdapterFailure["reason"],
    message: string,
  ): QuoteAdapterFailure => ({
    ok: false,
    adapterId: config.id,
    adapterName: config.displayName,
    quoteMode: "live" as const,
    network: LIVE_QUOTE_NETWORK,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    routeId: `${config.id}-failure`,
    label: `${config.displayName} live`,
    reason,
    message,
  });

  function normalize(
    request: QuoteRequest,
    response: AggregatorEstimateResponse,
    receivedAt: Date,
  ): QuoteAdapterResult {
    if (
      request.inputAssetId !== config.pair.inputAssetId ||
      request.outputAssetId !== config.pair.outputAssetId
    ) {
      return failure(request, "unsupported_pair", `${config.displayName} live quote supports ${config.pair.inputAssetId} to ${config.pair.outputAssetId} only.`);
    }

    if (request.network !== LIVE_QUOTE_NETWORK) {
      return failure(request, "unsupported_pair", `${config.displayName} live quote uses mainnet market data only.`);
    }

    const amountOut = asNumber(response.amount_out);
    const totalLpFee = asNumber(response.total_lp_fee);
    const totalDexFee = asNumber(response.total_dex_fee);
    const deposits = asNumber(response.deposits);
    const priceImpact = asNumber(response.avg_price_impact);
    const aggregatorFee = asNumber(response.aggregator_fee) ?? 0;
    const path = firstPath(response);

    if (
      response.token_in !== request.inputAssetId ||
      response.token_out !== request.outputAssetId ||
      amountOut === undefined ||
      totalLpFee === undefined ||
      totalDexFee === undefined ||
      deposits === undefined ||
      priceImpact === undefined ||
      !path
    ) {
      return failure(request, "failed_source", `${config.displayName} estimate response was malformed.`);
    }

    const outputAsset = requireAsset(request.outputAssetId);
    const routeHops = path.map((hop) => ({
      venue: typeof hop.protocol === "string" ? hop.protocol : config.displayName,
      inputAssetId: typeof hop.token_in === "string" ? hop.token_in : request.inputAssetId,
      outputAssetId: typeof hop.token_out === "string" ? hop.token_out : request.outputAssetId,
    }));

    const success: QuoteAdapterSuccess = {
      ok: true,
      adapterId: config.id,
      adapterName: config.displayName,
      quoteMode: "live",
      network: LIVE_QUOTE_NETWORK,
      inputAssetId: request.inputAssetId,
      outputAssetId: request.outputAssetId,
      routeId: `${config.id}-${request.inputAssetId}-${request.outputAssetId}`,
      label: `${config.displayName} live`,
      grossOutput: amountOut / 10 ** outputAsset.decimals,
      feeBreakdown: {
        dexFeeAda: totalLpFee + totalDexFee,
        batcherFeeAda: 0,
        networkFeeAda: 0,
        aggregatorFeeAda: aggregatorFee,
        minAdaRequirement: deposits,
      },
      routeHops,
      quoteTimestamp: receivedAt.toISOString(),
      expiresAt: new Date(receivedAt.getTime() + LIVE_QUOTE_MAX_AGE_MS).toISOString(),
      maxAgeMs: LIVE_QUOTE_MAX_AGE_MS,
      executable: false,
      priceImpactPct: priceImpact,
      confidencePct: 80,
      note: `Live ${config.displayName} estimate normalized as a read-only quote.`,
    };

    return success;
  }

  return {
    id: config.id,
    displayName: config.displayName,
    quoteMode: "live" as const,
    async getQuotes(request: QuoteRequest, now = new Date()): Promise<QuoteAdapterResult[]> {
      if (
        request.inputAssetId !== config.pair.inputAssetId ||
        request.outputAssetId !== config.pair.outputAssetId
      ) {
        return [failure(request, "unsupported_pair", `${config.displayName} live quote supports ${config.pair.inputAssetId} to ${config.pair.outputAssetId} only.`)];
      }

      if (request.network !== LIVE_QUOTE_NETWORK) {
        return [failure(request, "unsupported_pair", `${config.displayName} live quote uses mainnet market data only.`)];
      }

      try {
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
              include_protocols: [config.protocol],
              allow_multi_hops: false,
              amount_in_decimal: true,
            }),
          },
          LIVE_QUOTE_TIMEOUT_MS,
          2,
        );

        if (!response.ok) {
          return [failure(request, "failed_source", `${config.displayName} estimate failed with HTTP ${response.status}.`)];
        }

        const json = (await response.json()) as AggregatorEstimateResponse;
        return [normalize(request, json, now)];
      } catch {
        return [failure(request, "failed_source", `${config.displayName} estimate request timed out or could not be fetched.`)];
      }
    },
  };
}
