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

type MinswapEstimatePath = {
  protocol?: unknown;
  token_in?: unknown;
  token_out?: unknown;
  lp_fee?: unknown;
  dex_fee?: unknown;
  deposits?: unknown;
  price_impact?: unknown;
};

export type MinswapEstimateResponse = {
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

function failure(request: QuoteRequest, reason: QuoteAdapterFailure["reason"], message: string): QuoteAdapterFailure {
  return {
    ok: false,
    adapterId: minswapLiveReadOnlyAdapter.id,
    adapterName: minswapLiveReadOnlyAdapter.displayName,
    quoteMode: minswapLiveReadOnlyAdapter.quoteMode,
    network: LIVE_QUOTE_NETWORK,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    routeId: "minswap-live-readonly-failure",
    label: "Minswap live read-only",
    reason,
    message,
  };
}

function firstPath(response: MinswapEstimateResponse): MinswapEstimatePath[] | undefined {
  if (!Array.isArray(response.paths) || response.paths.length === 0) return undefined;
  const path = response.paths[0];
  if (!Array.isArray(path) || path.length === 0) return undefined;
  return path as MinswapEstimatePath[];
}

export function normalizeMinswapEstimate(
  request: QuoteRequest,
  response: MinswapEstimateResponse,
  receivedAt = new Date(),
): QuoteAdapterResult {
  if (request.inputAssetId !== FIRST_LIVE_PAIR.inputAssetId || request.outputAssetId !== FIRST_LIVE_PAIR.outputAssetId) {
    return failure(request, "unsupported_pair", "Live Minswap read-only quote currently supports ADA to SNEK only.");
  }

  if (request.network !== LIVE_QUOTE_NETWORK) {
    return failure(request, "unsupported_pair", "Live Minswap read-only quote uses mainnet market data only.");
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
    return failure(request, "failed_source", "Minswap estimate response was malformed.");
  }

  const outputAsset = requireAsset(request.outputAssetId);
  const routeHops = path.map((hop) => ({
    venue: typeof hop.protocol === "string" ? hop.protocol : "Minswap",
    inputAssetId: typeof hop.token_in === "string" ? hop.token_in : request.inputAssetId,
    outputAssetId: typeof hop.token_out === "string" ? hop.token_out : request.outputAssetId,
  }));

  const success: QuoteAdapterSuccess = {
    ok: true,
    adapterId: minswapLiveReadOnlyAdapter.id,
    adapterName: minswapLiveReadOnlyAdapter.displayName,
    quoteMode: minswapLiveReadOnlyAdapter.quoteMode,
    network: LIVE_QUOTE_NETWORK,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    routeId: `minswap-live-${request.inputAssetId}-${request.outputAssetId}`,
    label: "Minswap live read-only",
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
    confidencePct: 85,
    note: "Live Minswap estimate normalized as a read-only quote. No transaction can be built or signed from this screen.",
  };

  return success;
}

export const minswapLiveReadOnlyAdapter = {
  id: "minswap-live-readonly",
  displayName: "Minswap live read-only",
  quoteMode: "live" as const,
  async getQuotes(request: QuoteRequest, now = new Date()): Promise<QuoteAdapterResult[]> {
    if (request.inputAssetId !== FIRST_LIVE_PAIR.inputAssetId || request.outputAssetId !== FIRST_LIVE_PAIR.outputAssetId) {
      return [failure(request, "unsupported_pair", "Live Minswap read-only quote currently supports ADA to SNEK only.")];
    }

    if (request.network !== LIVE_QUOTE_NETWORK) {
      return [failure(request, "unsupported_pair", "Live Minswap read-only quote uses mainnet market data only.")];
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
            amount_in_decimal: true,
          }),
        },
        LIVE_QUOTE_TIMEOUT_MS,
        2,
      );

      if (!response.ok) {
        return [failure(request, "failed_source", `Minswap estimate failed with HTTP ${response.status}.`)];
      }

      const json = (await response.json()) as MinswapEstimateResponse;
      return [normalizeMinswapEstimate(request, json, now)];
    } catch {
      return [failure(request, "failed_source", "Minswap estimate request timed out or could not be fetched.")];
    }
  },
};
