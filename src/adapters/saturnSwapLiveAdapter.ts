import {
  LIVE_QUOTE_MAX_AGE_MS,
  LIVE_QUOTE_NETWORK,
  LIVE_QUOTE_TIMEOUT_MS,
  SATURN_API_KEY,
  SATURNSWAP_BASE_URL,
} from "../config/networks";
import { LOVELACE_ASSET_ID, requireAsset } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterFailure, QuoteAdapterResult, QuoteAdapterSuccess } from "./types";
import { fetchWithRetry } from "./fetchUtils";

type SaturnAmmPool = {
  id: string;
  poolId?: string;
  assetA: string;
  assetB: string;
  reserveA: number;
  reserveB: number;
  feePercent?: number;
  updatedAt?: string;
};

type SaturnAmmQuoteResponse = {
  expectedReceive?: number;
  expectedOut?: number;
  minReceive?: number;
  priceImpactPercent?: number;
  requiredInput?: number;
  buildable?: boolean;
  notBuildableReason?: string;
  pool?: SaturnAmmPool;
};

const SATURN_AMM_OUTPUT_SCALE = 1_000_000;

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


function toSaturnUnit(assetId: string): string {
  if (assetId === LOVELACE_ASSET_ID) return "lovelace";
  return `${assetId.slice(0, 56)}.${assetId.slice(56)}`;
}

async function findPool(request: QuoteRequest): Promise<SaturnAmmPool | null> {
  const inputUnit = toSaturnUnit(request.inputAssetId);
  const outputUnit = toSaturnUnit(request.outputAssetId);
  const response = await fetchWithRetry(
    `${SATURNSWAP_BASE_URL}/v1/aggregator/pools`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        ...(SATURN_API_KEY ? { SATURN_API_KEY } : {}),
      },
    },
    LIVE_QUOTE_TIMEOUT_MS,
    2,
  );
  if (!response.ok) throw new Error(`SaturnSwap pools failed with HTTP ${response.status}.`);
  const pools = (await response.json()) as SaturnAmmPool[];
  return pools.find((pool) => pool.assetA === inputUnit && pool.assetB === outputUnit) ?? null;
}

export const saturnSwapReadOnlyAdapter = {
  id: "saturnswap-live-readonly" as const,
  displayName: "SaturnSwap live",
  quoteMode: "live" as const,
  async getQuotes(request: QuoteRequest, now = new Date()): Promise<QuoteAdapterResult[]> {
    if (request.network !== LIVE_QUOTE_NETWORK) {
      return [failure(request, "unsupported_pair", "SaturnSwap live quote uses mainnet market data only.")];
    }

    if (request.inputAssetId !== LOVELACE_ASSET_ID) {
      return [failure(request, "unsupported_pair", "SaturnSwap AMM quote currently supports ADA input only.")];
    }

    try {
      const pool = await findPool(request);
      if (!pool) {
        return [failure(request, "unsupported_pair", "SaturnSwap AMM pool was not found for this pair.")];
      }
      const inputAsset = requireAsset(request.inputAssetId);
      const amountInBaseUnits = Math.round(request.amountIn * 10 ** inputAsset.decimals);

      const response = await fetchWithRetry(
        `${SATURNSWAP_BASE_URL}/v1/aggregator/amm/quote`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            ...(SATURN_API_KEY ? { SATURN_API_KEY } : {}),
          },
          body: JSON.stringify({
            poolId: pool.id,
            direction: "in",
            swapInAmount: amountInBaseUnits,
            slippageBps: Math.round(request.slippageTolerancePct * 100),
          }),
        },
        LIVE_QUOTE_TIMEOUT_MS,
        2,
      );

      if (!response.ok) {
        return [failure(request, "failed_source", `SaturnSwap quote failed with HTTP ${response.status}.`)];
      }

      const json = (await response.json()) as SaturnAmmQuoteResponse;
      const outputAmount = json.expectedReceive ?? json.expectedOut;

      if (typeof outputAmount !== "number" || outputAmount <= 0) {
        return [failure(request, "failed_source", "SaturnSwap quote response was malformed.")];
      }

      const outputAsset = requireAsset(request.outputAssetId);
      const grossOutput = outputAmount / SATURN_AMM_OUTPUT_SCALE / 10 ** outputAsset.decimals;
      const feePercent = json.pool?.feePercent ?? pool.feePercent ?? 0.3;

      const success: QuoteAdapterSuccess = {
        ok: true,
        adapterId: saturnSwapReadOnlyAdapter.id,
        adapterName: saturnSwapReadOnlyAdapter.displayName,
        quoteMode: saturnSwapReadOnlyAdapter.quoteMode,
        network: LIVE_QUOTE_NETWORK,
        inputAssetId: request.inputAssetId,
        outputAssetId: request.outputAssetId,
        routeId: `saturnswap-live-${request.inputAssetId}-${request.outputAssetId}`,
        label: "SaturnSwap AMM live",
        grossOutput,
        feeBreakdown: {
          dexFeeAda: request.amountIn * inputAsset.mockPriceAda * (feePercent / 100),
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
        priceImpactPct: json.priceImpactPercent ?? 0,
        confidencePct: 88,
        note: json.buildable === false && json.notBuildableReason
          ? `Live SaturnSwap AMM quote. Build currently unavailable: ${json.notBuildableReason}.`
          : "Live SaturnSwap AMM quote. Read-only, no transaction can be built from this screen.",
      };

      return [success];
    } catch {
      return [failure(request, "failed_source", "SaturnSwap quote request timed out or could not be fetched.")];
    }
  },
};
