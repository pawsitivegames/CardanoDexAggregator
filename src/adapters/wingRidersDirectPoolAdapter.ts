import { constantProductSwap, computeSwapPriceImpactPct } from "../domain/amm";
import {
  FIRST_LIVE_PAIR,
  LIVE_QUOTE_MAX_AGE_MS,
  LIVE_QUOTE_NETWORK,
  LIVE_QUOTE_TIMEOUT_MS,
  WINGRIDERS_BASE_URL,
} from "../config/networks";
import { requireAsset } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterFailure, QuoteAdapterResult, QuoteAdapterSuccess } from "./types";
import { fetchWithRetry } from "./fetchUtils";

const WINGRIDERS_V2_ADA_SNEK_POOL_ASSET = {
  policyId: "6fdc63a1d71dc2c65502b79baae7fb543185702b12c3c5fb639ed737",
  assetName: "e3b382a85249ef92357e00bd42c088c69c1eac2a736ae2df34dd2b89de11de1a",
};
const WINGRIDERS_FEE_BPS = 30;

type WingRidersToken = {
  policyId: string;
  assetName: string;
  quantity: string;
};

type WingRidersPoolResponse = {
  data?: {
    liquidityPoolById?: {
      version?: string;
      poolType?: string;
      tokenA?: WingRidersToken;
      tokenB?: WingRidersToken;
      tvlInAda?: string;
    } | null;
  };
};

function failure(request: QuoteRequest, reason: QuoteAdapterFailure["reason"], message: string): QuoteAdapterFailure {
  return {
    ok: false,
    adapterId: wingRidersV2DirectPoolAdapter.id,
    adapterName: wingRidersV2DirectPoolAdapter.displayName,
    quoteMode: wingRidersV2DirectPoolAdapter.quoteMode,
    network: LIVE_QUOTE_NETWORK,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    routeId: "wingriders-v2-direct-pool-failure",
    label: "WingRiders V2 direct pool",
    reason,
    message,
  };
}

function tokenId(token: { policyId: string; assetName: string }) {
  return token.policyId === "" && token.assetName === "" ? "lovelace" : `${token.policyId}${token.assetName}`;
}

function asPoolQuantity(token: WingRidersToken | undefined, assetId: string) {
  if (!token || tokenId(token) !== assetId) return undefined;
  const asset = requireAsset(assetId);
  const quantity = Number(token.quantity);
  if (!Number.isFinite(quantity)) return undefined;
  return quantity / 10 ** asset.decimals;
}

export async function fetchWingRidersV2Pool() {
  const response = await fetchWithRetry(
    `${WINGRIDERS_BASE_URL}/graphql`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        query: `
          query Pool($poolAsset: AssetInput!) {
            liquidityPoolById(poolAsset: $poolAsset) {
              ... on ILiquidityPool {
                version
                poolType
                tokenA { policyId assetName quantity }
                tokenB { policyId assetName quantity }
                tvlInAda
              }
            }
          }
        `,
        variables: { poolAsset: WINGRIDERS_V2_ADA_SNEK_POOL_ASSET },
      }),
    },
    LIVE_QUOTE_TIMEOUT_MS,
    2,
  );
  if (!response.ok) return null;
  const json = (await response.json()) as WingRidersPoolResponse;
  const pool = json.data?.liquidityPoolById;
  if (!pool || pool.version !== "V2" || pool.poolType !== "CONSTANT_PRODUCT") return null;
  return pool;
}

export const wingRidersV2DirectPoolAdapter = {
  id: "wingriders-v2-direct-pool",
  displayName: "WingRiders V2 direct pool",
  quoteMode: "live" as const,
  async getQuotes(request: QuoteRequest, now = new Date()): Promise<QuoteAdapterResult[]> {
    if (request.network !== LIVE_QUOTE_NETWORK) return [];
    if (request.inputAssetId !== FIRST_LIVE_PAIR.inputAssetId || request.outputAssetId !== FIRST_LIVE_PAIR.outputAssetId) {
      return [failure(request, "unsupported_pair", "WingRiders V2 direct pool currently supports ADA to SNEK only.")];
    }

    try {
      const pool = await fetchWingRidersV2Pool();
      if (!pool) return [failure(request, "failed_source", "WingRiders V2 pool data could not be fetched.")];

      const inputAsset = requireAsset(request.inputAssetId);
      const reserveIn = asPoolQuantity(pool.tokenA, request.inputAssetId);
      const reserveOut = asPoolQuantity(pool.tokenB, request.outputAssetId);
      if (!reserveIn || !reserveOut) {
        return [failure(request, "failed_source", "WingRiders V2 pool reserves did not match ADA/SNEK.")];
      }

      const output = constantProductSwap(request.amountIn, reserveIn, reserveOut, WINGRIDERS_FEE_BPS);
      const priceImpactPct = computeSwapPriceImpactPct(request.amountIn, reserveIn);

      const success: QuoteAdapterSuccess = {
        ok: true,
        adapterId: wingRidersV2DirectPoolAdapter.id,
        adapterName: wingRidersV2DirectPoolAdapter.displayName,
        quoteMode: wingRidersV2DirectPoolAdapter.quoteMode,
        network: LIVE_QUOTE_NETWORK,
        inputAssetId: request.inputAssetId,
        outputAssetId: request.outputAssetId,
        routeId: `wingriders-v2-pool-${request.inputAssetId}-${request.outputAssetId}`,
        label: "WingRiders V2 direct pool",
        grossOutput: output,
        feeBreakdown: {
          dexFeeAda: request.amountIn * inputAsset.mockPriceAda * (WINGRIDERS_FEE_BPS / 10000),
          batcherFeeAda: 0,
          networkFeeAda: 0,
          aggregatorFeeAda: 0,
          minAdaRequirement: 0,
        },
        routeHops: [
          {
            venue: "WingRidersV2",
            inputAssetId: request.inputAssetId,
            outputAssetId: request.outputAssetId,
          },
        ],
        quoteTimestamp: now.toISOString(),
        expiresAt: new Date(now.getTime() + LIVE_QUOTE_MAX_AGE_MS).toISOString(),
        maxAgeMs: LIVE_QUOTE_MAX_AGE_MS,
        executable: false,
        liquidityAda: pool.tvlInAda ? Number(pool.tvlInAda) / 1_000_000 : undefined,
        priceImpactPct,
        confidencePct: 91,
        note: "WingRiders V2 direct pool quote from WingRiders GraphQL reserves. Read-only.",
        poolReserveIn: reserveIn,
        poolReserveOut: reserveOut,
        poolFeeBps: WINGRIDERS_FEE_BPS,
      };

      return [success];
    } catch {
      return [failure(request, "failed_source", "WingRiders V2 pool quote timed out or could not be fetched.")];
    }
  },
};
