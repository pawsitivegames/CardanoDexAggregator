import {
  LIVE_QUOTE_MAX_AGE_MS,
  LIVE_QUOTE_NETWORK,
  LIVE_QUOTE_TIMEOUT_MS,
  SATURNSWAP_BASE_URL,
  SATURN_API_KEY,
} from "../config/networks";
import { requireAsset } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterFailure, QuoteAdapterResult, QuoteAdapterSuccess } from "./types";
import { fetchWithRetry } from "./fetchUtils";

type SaturnSwapQuoteRequest = {
  asset: string;
  direction: 3 | 4;
  amount: number;
};

type SaturnSwapQuoteResponse = {
  outputAmount: number;
  price: number;
  priceImpact: number;
};

function failure(request: QuoteRequest, reason: QuoteAdapterFailure["reason"], message: string): QuoteAdapterFailure {
  return {
    ok: false,
    adapterId: "saturnswap-live-readonly",
    adapterName: "SaturnSwap live",
    quoteMode: "live" as const,
    network: LIVE_QUOTE_NETWORK,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    routeId: "saturnswap-live-readonly-failure",
    label: "SaturnSwap live",
    reason,
    message,
  };
}


function toDirection(inputAssetId: string, outputAssetId: string): 3 | 4 {
  if (inputAssetId === "lovelace") return 3;
  if (outputAssetId === "lovelace") return 4;
  return 3;
}

export const saturnSwapReadOnlyAdapter = {
  id: "saturnswap-live-readonly" as const,
  displayName: "SaturnSwap live",
  quoteMode: "live" as const,
  async getQuotes(request: QuoteRequest, now = new Date()): Promise<QuoteAdapterResult[]> {
    if (request.network !== LIVE_QUOTE_NETWORK) {
      return [failure(request, "unsupported_pair", "SaturnSwap live quote uses mainnet market data only.")];
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (SATURN_API_KEY) {
      headers["SATURN_API_KEY"] = SATURN_API_KEY;
    }

    try {
      const quoteBody: SaturnSwapQuoteRequest = {
        asset: request.outputAssetId,
        direction: toDirection(request.inputAssetId, request.outputAssetId),
        amount: request.amountIn,
      };

      const response = await fetchWithRetry(
        `${SATURNSWAP_BASE_URL}/v1/aggregator/quote`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(quoteBody),
        },
        LIVE_QUOTE_TIMEOUT_MS,
        2,
      );

      if (!response.ok) {
        return [failure(request, "failed_source", `SaturnSwap quote failed with HTTP ${response.status}.`)];
      }

      const json = (await response.json()) as SaturnSwapQuoteResponse;

      if (typeof json.outputAmount !== "number" || json.outputAmount <= 0) {
        return [failure(request, "failed_source", "SaturnSwap quote response was malformed.")];
      }

      const outputAsset = requireAsset(request.outputAssetId);
      const grossOutput = json.outputAmount / 10 ** outputAsset.decimals;

      const success: QuoteAdapterSuccess = {
        ok: true,
        adapterId: saturnSwapReadOnlyAdapter.id,
        adapterName: saturnSwapReadOnlyAdapter.displayName,
        quoteMode: saturnSwapReadOnlyAdapter.quoteMode,
        network: LIVE_QUOTE_NETWORK,
        inputAssetId: request.inputAssetId,
        outputAssetId: request.outputAssetId,
        routeId: `saturnswap-live-${request.inputAssetId}-${request.outputAssetId}`,
        label: "SaturnSwap live",
        grossOutput,
        feeBreakdown: {
          dexFeeAda: 0,
          batcherFeeAda: 0,
          networkFeeAda: 0.17,
          aggregatorFeeAda: 0,
          minAdaRequirement: 0,
        },
        routeHops: [
          {
            venue: "SaturnSwap",
            inputAssetId: request.inputAssetId,
            outputAssetId: request.outputAssetId,
          },
        ],
        quoteTimestamp: now.toISOString(),
        expiresAt: new Date(now.getTime() + LIVE_QUOTE_MAX_AGE_MS).toISOString(),
        maxAgeMs: LIVE_QUOTE_MAX_AGE_MS,
        executable: false,
        priceImpactPct: json.priceImpact ?? 0,
        confidencePct: 88,
        note: "Live SaturnSwap CLOB quote — no batcher, instant execution model. Read-only, no transaction can be built from this screen.",
      };

      return [success];
    } catch {
      return [failure(request, "failed_source", "SaturnSwap quote request timed out or could not be fetched.")];
    }
  },
};
