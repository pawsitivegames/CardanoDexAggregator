import {
  CARDEXSCAN_API_KEY,
  CARDEXSCAN_BASE_URL,
  LIVE_QUOTE_MAX_AGE_MS,
  LIVE_QUOTE_NETWORK,
  LIVE_QUOTE_TIMEOUT_MS,
} from "../config/networks";
import { requireAsset } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterFailure, QuoteAdapterResult, QuoteAdapterSuccess } from "./types";
import { fetchWithRetry } from "./fetchUtils";

const LOVELACE = 1_000_000;
const CARDEXSCAN_ADA_ID = "lovelace";

type CardexscanSplit = {
  estimatedOutput: number;
  dex: string;
  minimumAmount: number;
  priceImpact: number;
  splitPercent: number;
  amountIn: number;
  deposits: number;
  batcherFee: number;
};

type CardexscanData = {
  estimatedTotalRecieve: number;
  splits: CardexscanSplit[];
};

type CardexscanEstimateResponse = {
  data: CardexscanData;
  error: null | string;
};

function failure(request: QuoteRequest, reason: QuoteAdapterFailure["reason"], message: string): QuoteAdapterFailure {
  return {
    ok: false,
    adapterId: "cardexscan-live-readonly",
    adapterName: "Cardexscan live",
    quoteMode: "live" as const,
    network: LIVE_QUOTE_NETWORK,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    routeId: "cardexscan-live-readonly-failure",
    label: "Cardexscan live",
    reason,
    message,
  };
}


function toCardexscanTokenId(assetId: string): string | { policyId: string; nameHex: string } {
  if (assetId === "lovelace") return CARDEXSCAN_ADA_ID;
  const policyId = assetId.slice(0, 56);
  const nameHex = assetId.slice(56);
  return { policyId, nameHex };
}

export const cardexscanReadOnlyAdapter = {
  id: "cardexscan-live-readonly" as const,
  displayName: "Cardexscan live",
  quoteMode: "live" as const,
  async getQuotes(request: QuoteRequest, now = new Date()): Promise<QuoteAdapterResult[]> {
    if (request.network !== LIVE_QUOTE_NETWORK) {
      return [failure(request, "unsupported_pair", "Cardexscan live quote uses mainnet market data only.")];
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (CARDEXSCAN_API_KEY) {
      headers["CARDEXSCAN_API_KEY"] = CARDEXSCAN_API_KEY;
    }

    try {
      const response = await fetchWithRetry(
        `${CARDEXSCAN_BASE_URL}/swap/aggregate`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            tokenInAmount: Math.round(request.amountIn * LOVELACE),
            slippage: request.slippageTolerancePct,
            tokenIn: toCardexscanTokenId(request.inputAssetId),
            tokenOut: toCardexscanTokenId(request.outputAssetId),
            blacklisted_dexes: [],
          }),
        },
        LIVE_QUOTE_TIMEOUT_MS,
        2,
      );

      if (!response.ok) {
        return [failure(request, "failed_source", `Cardexscan estimate failed with HTTP ${response.status}.`)];
      }

      const json = (await response.json()) as CardexscanEstimateResponse;

      if (
        !json.data ||
        typeof json.data.estimatedTotalRecieve !== "number" ||
        !Array.isArray(json.data.splits)
      ) {
        return [failure(request, "failed_source", "Cardexscan estimate response was malformed.")];
      }

      const outputAsset = requireAsset(request.outputAssetId);
      const grossOutput = json.data.estimatedTotalRecieve / 10 ** outputAsset.decimals;

      const totalBatcherFee = json.data.splits.reduce((sum, s) => sum + (s.batcherFee || 0), 0);
      const totalDeposits = json.data.splits.reduce((sum, s) => sum + (s.deposits || 0), 0);

      const routeHops = json.data.splits.map((s) => ({
        venue: s.dex,
        inputAssetId: request.inputAssetId,
        outputAssetId: request.outputAssetId,
      }));

      const success: QuoteAdapterSuccess = {
        ok: true,
        adapterId: cardexscanReadOnlyAdapter.id,
        adapterName: cardexscanReadOnlyAdapter.displayName,
        quoteMode: cardexscanReadOnlyAdapter.quoteMode,
        network: LIVE_QUOTE_NETWORK,
        inputAssetId: request.inputAssetId,
        outputAssetId: request.outputAssetId,
        routeId: `cardexscan-live-${request.inputAssetId}-${request.outputAssetId}`,
        label: "Cardexscan live",
        grossOutput,
        feeBreakdown: {
          dexFeeAda: 0,
          batcherFeeAda: totalBatcherFee / LOVELACE,
          networkFeeAda: 0,
          aggregatorFeeAda: 0,
          minAdaRequirement: totalDeposits / LOVELACE,
        },
        routeHops,
        quoteTimestamp: now.toISOString(),
        expiresAt: new Date(now.getTime() + LIVE_QUOTE_MAX_AGE_MS).toISOString(),
        maxAgeMs: LIVE_QUOTE_MAX_AGE_MS,
        executable: false,
        priceImpactPct: 0,
        confidencePct: 82,
        note: "Live Cardexscan estimate — batcher fees and deposits summed across all splits. Read-only, no transaction can be built from this screen.",
      };

      return [success];
    } catch {
      return [failure(request, "failed_source", "Cardexscan estimate request timed out or could not be fetched.")];
    }
  },
};
