import { computeOptimalAggregation } from "../domain/aggregator";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterResult, QuoteAdapterSuccess } from "./types";

const AGGREGATOR_ID = "clearroute-aggregator" as const;
const AGGREGATOR_NAME = "ClearRoute Aggregator" as const;

export function computeClearRouteAggregation(
  request: QuoteRequest,
  adapterResults: QuoteAdapterResult[],
  now: Date,
): QuoteAdapterResult | null {
  const successes = adapterResults.filter(
    (r): r is QuoteAdapterSuccess => r.ok && r.network === request.network,
  );

  if (successes.length === 0) return null;

  const sources = successes.map((s) => ({
    id: s.adapterId,
    label: s.label,
    grossOutput: s.grossOutput,
    fees: s.feeBreakdown,
    hops: s.routeHops,
    priceImpactPct: s.priceImpactPct,
    confidencePct: s.confidencePct,
  }));

  const poolSources = successes
    .filter((s) => s.poolReserveIn !== undefined && s.poolReserveOut !== undefined && s.poolFeeBps !== undefined)
    .map((s) => ({
      id: s.adapterId,
      label: s.label,
      grossOutput: s.grossOutput,
      fees: s.feeBreakdown,
      hops: s.routeHops,
      priceImpactPct: s.priceImpactPct,
      confidencePct: s.confidencePct,
      poolState: { reserveIn: s.poolReserveIn!, reserveOut: s.poolReserveOut!, feeBps: s.poolFeeBps! },
      poolLabel: s.label,
    }));

  const result = computeOptimalAggregation(request, sources, poolSources.length >= 2 ? poolSources : undefined);

  const success: QuoteAdapterSuccess = {
    ok: true,
    adapterId: AGGREGATOR_ID,
    adapterName: AGGREGATOR_NAME,
    quoteMode: "live",
    network: request.network,
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    routeId: "clearroute-aggregated",
    label: result.label,
    grossOutput: result.grossOutput,
    feeBreakdown: result.fees,
    routeHops: result.hops,
    quoteTimestamp: now.toISOString(),
    expiresAt: new Date(now.getTime() + 45_000).toISOString(),
    maxAgeMs: 45_000,
    executable: false,
    priceImpactPct: result.priceImpactPct,
    confidencePct: result.confidencePct,
    note: result.note,
  };

  return success;
}
