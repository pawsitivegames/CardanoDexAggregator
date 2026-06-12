import { describe, it, expect, vi, beforeEach } from "vitest";
import { cardexscanReadOnlyAdapter } from "./cardexscanLiveAdapter";
import { LOVELACE_ASSET_ID } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";

function makeRequest(overrides?: Partial<QuoteRequest>): QuoteRequest {
  return {
    inputAssetId: LOVELACE_ASSET_ID,
    outputAssetId: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
    amountIn: 100,
    slippageTolerancePct: 1,
    network: "mainnet",
    ...overrides,
  };
}

const mockSuccessResponse = {
  data: {
    estimatedTotalRecieve: 205611,
    splits: [
      {
        estimatedOutput: 146745,
        dex: "VyFinance",
        minimumAmount: 145412,
        priceImpact: 0.253,
        splitPercent: 71.41,
        amountIn: 714.1,
        deposits: 2000000,
        batcherFee: 2000000,
      },
      {
        estimatedOutput: 58744,
        dex: "WingRiders",
        minimumAmount: 58162,
        priceImpact: 0.459,
        splitPercent: 28.59,
        amountIn: 285.9,
        deposits: 2000000,
        batcherFee: 2000000,
      },
    ],
  },
  error: null,
};

describe("cardexscanReadOnlyAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns failure for non-mainnet network", async () => {
    const request = makeRequest({ network: "preprod" });
    const results = await cardexscanReadOnlyAdapter.getQuotes(request);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].reason).toBe("unsupported_pair");
    }
  });

  it("returns failure on HTTP error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const results = await cardexscanReadOnlyAdapter.getQuotes(makeRequest());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].reason).toBe("failed_source");
    }
  });

  it("returns success with summed fees across splits", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse),
    });
    const request = makeRequest();
    const results = await cardexscanReadOnlyAdapter.getQuotes(request);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    if (results[0].ok) {
      expect(results[0].adapterId).toBe("cardexscan-live-readonly");
      expect(results[0].quoteMode).toBe("live");
      expect(results[0].executable).toBe(false);
      expect(results[0].grossOutput).toBeGreaterThan(0);
      expect(results[0].feeBreakdown.batcherFeeAda).toBe(4_000_000 / 1_000_000);
      expect(results[0].feeBreakdown.minAdaRequirement).toBe(4_000_000 / 1_000_000);
      expect(results[0].routeHops).toHaveLength(2);
      expect(results[0].routeHops[0].venue).toBe("VyFinance");
      expect(results[0].routeHops[1].venue).toBe("WingRiders");
    }
  });

  it("returns failure on malformed response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { estimatedTotalRecieve: "not-a-number" } }),
    });
    const results = await cardexscanReadOnlyAdapter.getQuotes(makeRequest());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
  });

  it("handles single-split responses", async () => {
    const singleSplit = {
      data: {
        estimatedTotalRecieve: 50000,
        splits: [
          { dex: "MINSWAP", estimatedOutput: 50000, deposits: 2000000, batcherFee: 2000000 },
        ],
      },
      error: null,
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(singleSplit),
    });
    const results = await cardexscanReadOnlyAdapter.getQuotes(makeRequest());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    if (results[0].ok) {
      expect(results[0].routeHops).toHaveLength(1);
      expect(results[0].routeHops[0].venue).toBe("MINSWAP");
    }
  });
});
