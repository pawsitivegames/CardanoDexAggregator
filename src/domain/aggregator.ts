import { computeOptimalSplit, type PoolState } from "./amm";
import { totalFeesAda, type FeeBreakdown } from "./fees";
import { computeNetOutput } from "./quoteEngine";
import type { QuoteRequest, RouteHop } from "./routes";

export type AggregatorSource = {
  grossOutput: number;
  fees: FeeBreakdown;
  hops: RouteHop[];
  priceImpactPct: number;
  confidencePct: number;
  label: string;
  id: string;
};

export type AggregatorPoolSource = AggregatorSource & {
  poolState: PoolState;
  poolLabel: string;
};

export type AggregatedResult = {
  grossOutput: number;
  netOutput: number;
  fees: FeeBreakdown;
  hops: RouteHop[];
  priceImpactPct: number;
  confidencePct: number;
  label: string;
  note: string;
  isSplit: boolean;
};

function netOutputFromSource(
  grossOutput: number,
  fees: FeeBreakdown,
  amountIn: number,
): number {
  return computeNetOutput(grossOutput, fees, { amountIn, inputAssetId: "lovelace" });
}

function netOutputRate(
  grossOutput: number,
  fees: FeeBreakdown,
  amountIn: number,
): number {
  return amountIn > 0 ? netOutputFromSource(grossOutput, fees, amountIn) / amountIn : 0;
}

function bestSingleSource(
  sources: AggregatorSource[],
  amountIn: number,
): { source: AggregatorSource; netOutput: number } | null {
  if (sources.length === 0) return null;
  const sorted = [...sources].sort(
    (a, b) => netOutputRate(b.grossOutput, b.fees, amountIn) - netOutputRate(a.grossOutput, a.fees, amountIn),
  );
  const best = sorted[0];
  return { source: best, netOutput: netOutputFromSource(best.grossOutput, best.fees, amountIn) };
}

function computeSplitFees(
  amountIn: number,
  pools: AggregatorPoolSource[],
  allocations: number[],
  outputs: number[],
): FeeBreakdown {
  const totalDexFee = pools.reduce((s, p, i) => {
    const portion = allocations[i] / amountIn;
    return s + p.fees.dexFeeAda * portion;
  }, 0);
  const totalBatcher = pools.reduce((s, p, i) => {
    const portion = allocations[i] / amountIn;
    return s + p.fees.batcherFeeAda * portion;
  }, 0);

  const hopList = pools.flatMap((p) => p.hops);
  const networkFee = hopList.length > 0 ? 0.3 : 0;

  return {
    dexFeeAda: totalDexFee,
    batcherFeeAda: totalBatcher,
    networkFeeAda: networkFee,
    aggregatorFeeAda: 0,
    minAdaRequirement: 0,
  };
}

function computeSplitPriceImpact(
  pools: AggregatorPoolSource[],
  allocations: number[],
  outputs: number[],
): number {
  let totalImpact = 0;
  let totalOutput = 0;
  for (let i = 0; i < pools.length; i++) {
    if (allocations[i] > 0 && outputs[i] > 0) {
      const spotPrice = pools[i].poolState.reserveOut / pools[i].poolState.reserveIn;
      const execPrice = outputs[i] / allocations[i];
      const impact = Math.max(0, (1 - execPrice / spotPrice) * 100);
      totalImpact += impact * outputs[i];
      totalOutput += outputs[i];
    }
  }
  return totalOutput > 0 ? totalImpact / totalOutput : 0;
}

export function computeOptimalAggregation(
  request: QuoteRequest,
  sources: AggregatorSource[],
  poolSources?: AggregatorPoolSource[],
): AggregatedResult {
  if (sources.length === 0) {
    return {
      grossOutput: 0, netOutput: 0,
      fees: { dexFeeAda: 0, batcherFeeAda: 0, networkFeeAda: 0, aggregatorFeeAda: 0, minAdaRequirement: 0 },
      hops: [], priceImpactPct: 0, confidencePct: 0,
      label: "No sources", note: "",
      isSplit: false,
    };
  }

  const amountIn = request.amountIn;

  const bestSingle = bestSingleSource(sources, amountIn);

  let splitResult: { allocations: number[]; outputs: number[]; totalOutput: number } | null = null;
  let splitLabel = "";
  let splitHops: RouteHop[] = [];
  let splitFees: FeeBreakdown = { dexFeeAda: 0, batcherFeeAda: 0, networkFeeAda: 0, aggregatorFeeAda: 0, minAdaRequirement: 0 };
  let splitImpact = 0;
  let splitConfidence = 0;

  if (poolSources && poolSources.length >= 2) {
    const pools = poolSources.map((ps) => ps.poolState);
    splitResult = computeOptimalSplit(amountIn, pools);

    if (splitResult.totalOutput > 0) {
      const parts: string[] = [];
      for (let i = 0; i < poolSources.length; i++) {
        const pct = (splitResult.allocations[i] / amountIn) * 100;
        if (pct > 0.5) {
          parts.push(`${poolSources[i].poolLabel} (${pct.toFixed(0)}%)`);
          splitHops.push(...poolSources[i].hops);
        }
      }
      splitLabel = parts.length > 0 ? `ClearRoute: ${parts.join(" + ")}` : "ClearRoute split";
      splitFees = computeSplitFees(amountIn, poolSources, splitResult.allocations, splitResult.outputs);
      splitImpact = computeSplitPriceImpact(poolSources, splitResult.allocations, splitResult.outputs);
      const sr = splitResult;
      splitConfidence = Math.round(
        poolSources.reduce((s, ps, i) => {
          const portion = sr.allocations[i] / amountIn;
          return s + ps.confidencePct * portion;
        }, 0),
      );
    }
  }

  if (splitResult && bestSingle) {
    const splitNet = netOutputFromSource(splitResult.totalOutput, splitFees, amountIn);
    const bestNet = bestSingle.netOutput;

    if (splitNet > bestNet) {
      return {
        grossOutput: splitResult.totalOutput,
        netOutput: splitNet,
        fees: splitFees,
        hops: splitHops,
        priceImpactPct: splitImpact,
        confidencePct: splitConfidence,
        label: splitLabel,
        note: `ClearRoute split across ${poolSources!.length} pools beats the best single source. Split: ${splitLabel}.`,
        isSplit: true,
      };
    }
  }

  const best = bestSingle!;
  const bestNet = bestSingle!.netOutput;

  return {
    grossOutput: best.source.grossOutput,
    netOutput: bestNet,
    fees: best.source.fees,
    hops: best.source.hops,
    priceImpactPct: best.source.priceImpactPct,
    confidencePct: best.source.confidencePct,
    label: `ClearRoute: ${best.source.label}`,
    note: `ClearRoute selected the best route: ${best.source.label}. Total fees: ${totalFeesAda(best.source.fees)} ADA.`,
    isSplit: false,
  };
}
