import {
  LIVE_QUOTE_MAX_AGE_MS,
  LIVE_QUOTE_NETWORK,
  LIVE_QUOTE_TIMEOUT_MS,
  STEELSWAP_BASE_URL,
  STEELSWAP_PARTNER,
} from "../config/networks";
import { requireAsset } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterFailure, QuoteAdapterResult, QuoteAdapterSuccess } from "./types";
import { fetchWithRetry } from "./fetchUtils";

const LOVELACE = 1_000_000;
const STEELSWAP_ADA_ID = "lovelace";

type SteelswapSplitGroup = {
  dex?: string;
  quantity_in?: number;
  expected_output?: number;
  fee?: number;
  deposit?: number;
  pools?: Array<{
    dex?: string;
    poolId?: string;
    quantityA?: number;
    quantityB?: number;
    batcherFee?: number;
    deposit?: number;
    volumeFee?: number;
  }>;
};

type SteelswapEstimateResponse = {
  quantityA: number;
  quantityB: number;
  totalFee: number;
  totalDeposit: number;
  steelswapFee: number;
  bonusOut: number;
  price: number;
  splitGroup: Array<SteelswapSplitGroup | SteelswapSplitGroup[]>;
};

type SteelswapTokenListEntry = {
  ticker?: string;
  policyId?: string;
  policyName?: string;
};

let tokenHeaderCache: string | undefined;

function failure(request: QuoteRequest, reason: QuoteAdapterFailure["reason"], message: string): QuoteAdapterFailure {
  return {
    ok: false,
    adapterId: "steelswap-live-readonly",
    adapterName: "Steelswap live",
    quoteMode: "live" as const,
    network: LIVE_QUOTE_NETWORK,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    routeId: "steelswap-live-readonly-failure",
    label: "Steelswap live",
    reason,
    message,
  };
}


function toSteelswapTokenId(assetId: string): string {
  return assetId === "lovelace" ? STEELSWAP_ADA_ID : assetId;
}

async function fetchSteelswapTokenHeader(): Promise<string | undefined> {
  if (tokenHeaderCache) return tokenHeaderCache;

  const response = await fetchWithRetry(
    `${STEELSWAP_BASE_URL}/tokens/list/`,
    {
      headers: {
        accept: "application/json",
      },
    },
    LIVE_QUOTE_TIMEOUT_MS,
    1,
  );

  if (!response.ok) return undefined;

  const tokenList = (await response.json()) as SteelswapTokenListEntry[];
  const commToken = Array.isArray(tokenList) ? tokenList[tokenList.length - 1] : undefined;
  if (!commToken?.policyId || typeof commToken.policyName !== "string") return undefined;

  tokenHeaderCache = `${commToken.policyId}${commToken.policyName}`;
  return tokenHeaderCache;
}

function flattenSplitGroup(splitGroup: SteelswapEstimateResponse["splitGroup"]): SteelswapSplitGroup[] {
  return splitGroup.flatMap((group) => (Array.isArray(group) ? group : [group]));
}

function routeHopsFromSplitGroup(response: SteelswapEstimateResponse, request: QuoteRequest) {
  const poolDexes = flattenSplitGroup(Array.isArray(response.splitGroup) ? response.splitGroup : [])
    .flatMap((group) => group.pools ?? [])
    .map((pool) => pool.dex)
    .filter((dex): dex is string => Boolean(dex));
  const venues = poolDexes.length > 0 ? Array.from(new Set(poolDexes)) : ["Steelswap"];

  return venues.map((venue) => ({
    venue,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
  }));
}

export function __resetSteelswapTokenHeaderCacheForTests(): void {
  tokenHeaderCache = undefined;
}

export const steelswapReadOnlyAdapter = {
  id: "steelswap-live-readonly" as const,
  displayName: "Steelswap live",
  quoteMode: "live" as const,
  async getQuotes(request: QuoteRequest, now = new Date()): Promise<QuoteAdapterResult[]> {
    if (request.network !== LIVE_QUOTE_NETWORK) {
      return [failure(request, "unsupported_pair", "Steelswap live quote uses mainnet market data only.")];
    }

    try {
      const tokenHeader = await fetchSteelswapTokenHeader();
      if (!tokenHeader) {
        return [failure(request, "failed_source", "Steelswap token metadata could not be fetched.")];
      }

      const response = await fetchWithRetry(
        `${STEELSWAP_BASE_URL}/swap/estimate/`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            token: tokenHeader,
          },
          body: JSON.stringify({
            tokenA: toSteelswapTokenId(request.inputAssetId),
            tokenB: toSteelswapTokenId(request.outputAssetId),
            quantity: Math.round(request.amountIn * LOVELACE),
            predictFromOutputAmount: false,
            ignoreDexes: [],
            partner: STEELSWAP_PARTNER === "clearroute-aggregator" ? "" : STEELSWAP_PARTNER,
            da: [],
            hop: true,
          }),
        },
        LIVE_QUOTE_TIMEOUT_MS,
        2,
      );

      if (!response.ok) {
        return [failure(request, "failed_source", `Steelswap estimate failed with HTTP ${response.status}.`)];
      }

      const json = (await response.json()) as SteelswapEstimateResponse;

      if (
        typeof json.quantityB !== "number" ||
        typeof json.totalFee !== "number" ||
        typeof json.totalDeposit !== "number"
      ) {
        return [failure(request, "failed_source", "Steelswap estimate response was malformed.")];
      }

      const outputAsset = requireAsset(request.outputAssetId);
      const grossOutput = json.quantityB / 10 ** outputAsset.decimals;
      const routeHops = routeHopsFromSplitGroup(json, request);

      const success: QuoteAdapterSuccess = {
        ok: true,
        adapterId: steelswapReadOnlyAdapter.id,
        adapterName: steelswapReadOnlyAdapter.displayName,
        quoteMode: steelswapReadOnlyAdapter.quoteMode,
        network: LIVE_QUOTE_NETWORK,
        inputAssetId: request.inputAssetId,
        outputAssetId: request.outputAssetId,
        routeId: `steelswap-live-${request.inputAssetId}-${request.outputAssetId}`,
        label: "Steelswap live",
        grossOutput,
        feeBreakdown: {
          dexFeeAda: 0,
          batcherFeeAda: json.totalFee / LOVELACE,
          networkFeeAda: 0,
          aggregatorFeeAda: json.steelswapFee / LOVELACE,
          minAdaRequirement: json.totalDeposit / LOVELACE,
        },
        routeHops,
        quoteTimestamp: now.toISOString(),
        expiresAt: new Date(now.getTime() + LIVE_QUOTE_MAX_AGE_MS).toISOString(),
        maxAgeMs: LIVE_QUOTE_MAX_AGE_MS,
        executable: false,
        priceImpactPct: 0,
        confidencePct: 85,
        note: "Live Steelswap estimate. Read-only, no transaction can be built from this screen.",
      };

      return [success];
    } catch {
      return [failure(request, "failed_source", "Steelswap estimate request timed out or could not be fetched.")];
    }
  },
};
