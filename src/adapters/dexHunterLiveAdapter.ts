import {
  DEXHUNTER_BASE_URL,
  DEXHUNTER_PARTNER_ID,
  LIVE_QUOTE_MAX_AGE_MS,
  LIVE_QUOTE_NETWORK,
  LIVE_QUOTE_TIMEOUT_MS,
} from "../config/networks";
import { requireAsset } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterFailure, QuoteAdapterResult, QuoteAdapterSuccess } from "./types";
import { fetchWithRetry } from "./fetchUtils";

type DexHunterSplit = {
  dex: string;
  amount_in: number;
  expected_output: number;
  expected_output_without_slippage: number;
  fee: number;
  price_impact: number;
  batcher_fee: number;
  deposits: number;
};

type DexHunterEstimateResponse = {
  splits: DexHunterSplit[];
  total_output: number;
  total_output_without_slippage: number;
  total_fee: number;
  batcher_fee: number;
  dexhunter_fee: number;
  deposits: number;
  partner_fee: number;
  net_price_reverse: number;
};

function failure(request: QuoteRequest, reason: QuoteAdapterFailure["reason"], message: string): QuoteAdapterFailure {
  return {
    ok: false,
    adapterId: "dexhunter-live-readonly",
    adapterName: "DexHunter live",
    quoteMode: "live" as const,
    network: LIVE_QUOTE_NETWORK,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    routeId: "dexhunter-live-readonly-failure",
    label: "DexHunter live",
    reason,
    message,
  };
}


export const dexHunterReadOnlyAdapter = {
  id: "dexhunter-live-readonly" as const,
  displayName: "DexHunter live",
  quoteMode: "live" as const,
  async getQuotes(request: QuoteRequest, now = new Date()): Promise<QuoteAdapterResult[]> {
    if (request.network !== LIVE_QUOTE_NETWORK) {
      return [failure(request, "unsupported_pair", "DexHunter live quote uses mainnet market data only.")];
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (DEXHUNTER_PARTNER_ID) {
      headers["X-Partner-Id"] = DEXHUNTER_PARTNER_ID;
    }

    try {
      const response = await fetchWithRetry(
        `${DEXHUNTER_BASE_URL}/swap/estimate`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            token_in: request.inputAssetId === "lovelace" ? "" : request.inputAssetId,
            token_out: request.outputAssetId === "lovelace" ? "" : request.outputAssetId,
            amount_in: request.amountIn,
            slippage: request.slippageTolerancePct,
            blacklisted_dexes: [],
          }),
        },
        LIVE_QUOTE_TIMEOUT_MS,
        2,
      );

      if (!response.ok) {
        return [failure(request, "failed_source", `DexHunter estimate failed with HTTP ${response.status}.`)];
      }

      const json = (await response.json()) as DexHunterEstimateResponse;

      if (
        typeof json.total_output_without_slippage !== "number" ||
        !Array.isArray(json.splits) ||
        json.splits.length === 0
      ) {
        return [failure(request, "failed_source", "DexHunter estimate response was malformed.")];
      }

      const outputAsset = requireAsset(request.outputAssetId);
      const totalFeeAda = (json.batcher_fee ?? 0) + (json.deposits ?? 0) + (json.partner_fee ?? 0) + (json.dexhunter_fee ?? 0);
      const feeInOutputUnits = totalFeeAda * (json.net_price_reverse ?? 0);
      const adjustedRaw = json.total_output_without_slippage + feeInOutputUnits;
      const grossOutput = adjustedRaw / 10 ** outputAsset.decimals;

      const routeHops = json.splits.map((s) => ({
        venue: s.dex,
        inputAssetId: request.inputAssetId,
        outputAssetId: request.outputAssetId,
      }));

      const success: QuoteAdapterSuccess = {
        ok: true,
        adapterId: dexHunterReadOnlyAdapter.id,
        adapterName: dexHunterReadOnlyAdapter.displayName,
        quoteMode: dexHunterReadOnlyAdapter.quoteMode,
        network: LIVE_QUOTE_NETWORK,
        inputAssetId: request.inputAssetId,
        outputAssetId: request.outputAssetId,
        routeId: `dexhunter-live-${request.inputAssetId}-${request.outputAssetId}`,
        label: "DexHunter live",
        grossOutput,
        feeBreakdown: {
          dexFeeAda: 0,
          batcherFeeAda: json.batcher_fee,
          networkFeeAda: 0,
          aggregatorFeeAda: json.dexhunter_fee + json.partner_fee,
          minAdaRequirement: json.deposits,
        },
        routeHops,
        quoteTimestamp: now.toISOString(),
        expiresAt: new Date(now.getTime() + LIVE_QUOTE_MAX_AGE_MS).toISOString(),
        maxAgeMs: LIVE_QUOTE_MAX_AGE_MS,
        executable: false,
        priceImpactPct: json.splits[0]?.price_impact ?? 0,
        confidencePct: 80,
        note: `Live DexHunter estimate across ${json.splits.length} split(s). No transaction can be built from this screen.`,
      };

      return [success];
    } catch {
      return [failure(request, "failed_source", "DexHunter estimate request timed out or could not be fetched.")];
    }
  },
};
