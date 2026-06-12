import { describe, it, expect, vi, beforeEach } from "vitest";
import { saturnSwapReadOnlyAdapter } from "./saturnSwapLiveAdapter";
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
  outputAmount: 48500,
  price: 0.00206,
  priceImpact: 0.35,
};

describe("saturnSwapReadOnlyAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns failure for non-mainnet network", async () => {
    const request = makeRequest({ network: "preprod" });
    const results = await saturnSwapReadOnlyAdapter.getQuotes(request);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].reason).toBe("unsupported_pair");
    }
  });

  it("returns failure on HTTP error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const results = await saturnSwapReadOnlyAdapter.getQuotes(makeRequest());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].reason).toBe("failed_source");
    }
  });

  it("returns success with parsed output", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse),
    });
    const request = makeRequest();
    const results = await saturnSwapReadOnlyAdapter.getQuotes(request);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    if (results[0].ok) {
      expect(results[0].adapterId).toBe("saturnswap-live-readonly");
      expect(results[0].quoteMode).toBe("live");
      expect(results[0].executable).toBe(false);
      expect(results[0].grossOutput).toBeGreaterThan(0);
      expect(results[0].priceImpactPct).toBe(0.35);
      expect(results[0].feeBreakdown.batcherFeeAda).toBe(0);
      expect(results[0].routeHops).toHaveLength(1);
      expect(results[0].routeHops[0].venue).toBe("SaturnSwap");
    }
  });

  it("returns failure on malformed response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ outputAmount: "not-a-number" }),
    });
    const results = await saturnSwapReadOnlyAdapter.getQuotes(makeRequest());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
  });

  it("returns failure on zero outputAmount", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ outputAmount: 0, price: 0, priceImpact: 0 }),
    });
    const results = await saturnSwapReadOnlyAdapter.getQuotes(makeRequest());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
  });

  it("uses direction 3 for ADA→token and 4 for token→ADA", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse),
    });
    globalThis.fetch = fetchMock;

    const adaToToken = makeRequest();
    await saturnSwapReadOnlyAdapter.getQuotes(adaToToken);
    const call1 = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(call1.direction).toBe(3);

    fetchMock.mockClear();
    const tokenToAda = makeRequest({
      inputAssetId: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
      outputAssetId: LOVELACE_ASSET_ID,
    });
    await saturnSwapReadOnlyAdapter.getQuotes(tokenToAda);
    const call2 = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(call2.direction).toBe(4);
  });
});
