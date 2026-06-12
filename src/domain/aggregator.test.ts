import { describe, it, expect } from "vitest";
import { computeOptimalAggregation } from "./aggregator";
import type { QuoteRequest } from "./routes";

const baseRequest: QuoteRequest = {
  inputAssetId: "lovelace",
  outputAssetId: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
  amountIn: 1000,
  slippageTolerancePct: 0.5,
  network: "mainnet",
};

describe("computeOptimalAggregation", () => {
  it("returns empty result for empty sources", () => {
    const result = computeOptimalAggregation(baseRequest, []);
    expect(result.grossOutput).toBe(0);
    expect(result.label).toBe("No sources");
  });

  it("picks the best source by net output rate", () => {
    const sources = [
      { id: "minswap", label: "Minswap", grossOutput: 416784, fees: { dexFeeAda: 12, batcherFeeAda: 0, networkFeeAda: 0, aggregatorFeeAda: 0, minAdaRequirement: 2 }, hops: [{ venue: "Minswap", inputAssetId: "lovelace", outputAssetId: "snek" }], priceImpactPct: 1.04, confidencePct: 85 },
      { id: "dexhunter", label: "DexHunter", grossOutput: 417604, fees: { dexFeeAda: 0, batcherFeeAda: 2, networkFeeAda: 0, aggregatorFeeAda: 2, minAdaRequirement: 2 }, hops: [{ venue: "DexHunter", inputAssetId: "lovelace", outputAssetId: "snek" }], priceImpactPct: 0.08, confidencePct: 80 },
    ];
    const result = computeOptimalAggregation(baseRequest, sources);
    expect(result.label).toBe("ClearRoute: Minswap");
    expect(result.grossOutput).toBe(416784);
  });

  it("returns single source", () => {
    const sources = [
      { id: "dexhunter", label: "DexHunter", grossOutput: 417604, fees: { dexFeeAda: 0, batcherFeeAda: 2, networkFeeAda: 0, aggregatorFeeAda: 2, minAdaRequirement: 2 }, hops: [{ venue: "DexHunter", inputAssetId: "lovelace", outputAssetId: "snek" }], priceImpactPct: 0.08, confidencePct: 80 },
    ];
    const result = computeOptimalAggregation(baseRequest, sources);
    expect(result.label).toBe("ClearRoute: DexHunter");
    expect(result.grossOutput).toBe(417604);
  });

  it("ranks higher gross but higher-fee source correctly", () => {
    const sources = [
      { id: "high-fee", label: "HighFee", grossOutput: 418000, fees: { dexFeeAda: 0, batcherFeeAda: 5, networkFeeAda: 0, aggregatorFeeAda: 5, minAdaRequirement: 5 }, hops: [{ venue: "HighFee", inputAssetId: "lovelace", outputAssetId: "snek" }], priceImpactPct: 0.1, confidencePct: 90 },
      { id: "low-fee", label: "LowFee", grossOutput: 416500, fees: { dexFeeAda: 0, batcherFeeAda: 0, networkFeeAda: 0, aggregatorFeeAda: 0, minAdaRequirement: 1 }, hops: [{ venue: "LowFee", inputAssetId: "lovelace", outputAssetId: "snek" }], priceImpactPct: 0.1, confidencePct: 90 },
    ];
    const result = computeOptimalAggregation(baseRequest, sources);
    expect(result.label).toBe("ClearRoute: LowFee");
  });

  it("returns best single source when pool sources are insufficient (<2)", () => {
    const sources = [
      { id: "src1", label: "Source1", grossOutput: 100, fees: { dexFeeAda: 1, batcherFeeAda: 0, networkFeeAda: 0, aggregatorFeeAda: 0, minAdaRequirement: 0 }, hops: [], priceImpactPct: 0.1, confidencePct: 90 },
    ];
    const poolSources = [
      { id: "pool1", label: "Pool1", grossOutput: 100, fees: EMPTY_FEES, hops: [], priceImpactPct: 0.1, confidencePct: 90, poolState: { reserveIn: 100_000, reserveOut: 1_000_000, feeBps: 30 }, poolLabel: "Pool1" },
    ];
    const result = computeOptimalAggregation(baseRequest, sources, poolSources);
    expect(result.label).toContain("Source1");
    expect(result.isSplit).toBe(false);
  });

  it("can produce a split result when pool sources are available and split beats single", () => {
    const largeRequest = { ...baseRequest, amountIn: 200_000 };
    const poolSources = [
      { id: "pool-deep", label: "DeepPool", grossOutput: 398601, fees: EMPTY_FEES, hops: [{ venue: "Deep", inputAssetId: "lovelace", outputAssetId: "snek" }], priceImpactPct: 0.5, confidencePct: 92, poolState: { reserveIn: 2_000_000, reserveOut: 800_000_000, feeBps: 30 }, poolLabel: "DeepPool" },
      { id: "pool-shallow", label: "ShallowPool", grossOutput: 300000, fees: EMPTY_FEES, hops: [{ venue: "Shallow", inputAssetId: "lovelace", outputAssetId: "snek" }], priceImpactPct: 3, confidencePct: 85, poolState: { reserveIn: 50_000, reserveOut: 20_000_000, feeBps: 30 }, poolLabel: "ShallowPool" },
    ];
    const sources = poolSources.map((ps) => ({ id: ps.id, label: ps.label, grossOutput: ps.grossOutput, fees: ps.fees, hops: ps.hops, priceImpactPct: ps.priceImpactPct, confidencePct: ps.confidencePct }));
    const result = computeOptimalAggregation(largeRequest, sources, poolSources);
    expect(result.grossOutput).toBeGreaterThan(0);
  });
});

const EMPTY_FEES = { dexFeeAda: 0, batcherFeeAda: 0, networkFeeAda: 0, aggregatorFeeAda: 0, minAdaRequirement: 0 };
