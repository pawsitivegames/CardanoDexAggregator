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
  expectedReceive: 48500,
  expectedOut: 48500,
  minReceive: 48257,
  priceImpactPercent: 0.35,
  buildable: true,
  pool: {
    id: "snek-lovelace",
    assetA: "lovelace",
    assetB: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f.534e454b",
    reserveA: 1_000_000_000,
    reserveB: 500_000,
    feePercent: 0.3,
  },
};

const mockPools = [
  {
    id: "snek-lovelace",
    assetA: "lovelace",
    assetB: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f.534e454b",
    reserveA: 1_000_000_000,
    reserveB: 500_000,
    feePercent: 0.3,
  },
];

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
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPools),
      })
      .mockResolvedValueOnce({
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
      expect(results[0].grossOutput).toBe(0.0485);
      expect(results[0].priceImpactPct).toBe(0.35);
      expect(results[0].feeBreakdown.batcherFeeAda).toBe(0);
      expect(results[0].feeBreakdown.dexFeeAda).toBe(0.3);
      expect(results[0].routeHops).toHaveLength(1);
      expect(results[0].routeHops[0].venue).toBe("SaturnSwap");
    }
  });

  it("returns failure on malformed response", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPools),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ expectedReceive: "not-a-number" }),
      });
    const results = await saturnSwapReadOnlyAdapter.getQuotes(makeRequest());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
  });

  it("returns failure on zero outputAmount", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPools),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ expectedReceive: 0, priceImpactPercent: 0 }),
      });
    const results = await saturnSwapReadOnlyAdapter.getQuotes(makeRequest());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
  });

  it("uses the matching AMM pool id and base-unit input amount", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPools),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
    globalThis.fetch = fetchMock;

    const adaToToken = makeRequest();
    await saturnSwapReadOnlyAdapter.getQuotes(adaToToken);
    const call = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(call.poolId).toBe("snek-lovelace");
    expect(call.direction).toBe("in");
    expect(call.swapInAmount).toBe(100_000_000);
    expect(call.slippageBps).toBe(100);
  });

  it("returns unsupported_pair for token→ADA until the AMM path supports reverse direction", async () => {
    const tokenToAda = makeRequest({
      inputAssetId: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
      outputAssetId: LOVELACE_ASSET_ID,
    });
    const results = await saturnSwapReadOnlyAdapter.getQuotes(tokenToAda);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) expect(results[0].reason).toBe("unsupported_pair");
  });
});
