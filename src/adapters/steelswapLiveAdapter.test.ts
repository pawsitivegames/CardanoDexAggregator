import { describe, it, expect, vi, beforeEach } from "vitest";
import { __resetSteelswapTokenHeaderCacheForTests, steelswapReadOnlyAdapter } from "./steelswapLiveAdapter";
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
  quantityA: 100_000_000,
  quantityB: 47000000000,
  totalFee: 10,
  totalDeposit: 2000000,
  steelswapFee: 0,
  bonusOut: 0,
  price: 0.002127,
  splitGroup: [[
    {
      quantityA: 100_000_000,
      quantityB: 47000000000,
      pools: [{ dex: "SundaeSwap", quantityA: 100_000_000, quantityB: 47000000000, batcherFee: 10, deposit: 2000000 }],
    },
  ]],
};

const mockTokenList = [
  { ticker: "ADA", policyId: "lovelace", policyName: "" },
  { ticker: "Nike", policyId: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c", policyName: "64d494e" },
];

describe("steelswapReadOnlyAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __resetSteelswapTokenHeaderCacheForTests();
  });

  it("returns failure for non-mainnet network", async () => {
    const request = makeRequest({ network: "preprod" });
    const results = await steelswapReadOnlyAdapter.getQuotes(request);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].reason).toBe("unsupported_pair");
    }
  });

  it("returns failure on HTTP error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const results = await steelswapReadOnlyAdapter.getQuotes(makeRequest());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].reason).toBe("failed_source");
    }
  });

  it("returns success with parsed gross output and fees", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenList),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
    const request = makeRequest();
    const results = await steelswapReadOnlyAdapter.getQuotes(request);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    if (results[0].ok) {
      expect(results[0].adapterId).toBe("steelswap-live-readonly");
      expect(results[0].quoteMode).toBe("live");
      expect(results[0].executable).toBe(false);
      expect(results[0].grossOutput).toBeGreaterThan(0);
      expect(results[0].feeBreakdown.batcherFeeAda).toBe(10 / 1_000_000);
      expect(results[0].feeBreakdown.minAdaRequirement).toBe(2_000_000 / 1_000_000);
      expect(results[0].feeBreakdown.aggregatorFeeAda).toBe(0);
      expect(results[0].routeHops).toHaveLength(1);
      expect(results[0].routeHops[0].venue).toBe("SundaeSwap");
    }
  });

  it("sends the current Steelswap estimate payload and public token header", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenList),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
    globalThis.fetch = fetchMock;

    await steelswapReadOnlyAdapter.getQuotes(makeRequest({ amountIn: 1000 }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, estimateInit] = fetchMock.mock.calls[1];
    expect(estimateInit.headers).toMatchObject({
      token: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e",
    });
    expect(JSON.parse(estimateInit.body as string)).toMatchObject({
      tokenA: LOVELACE_ASSET_ID,
      tokenB: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
      quantity: 1_000_000_000,
      predictFromOutputAmount: false,
      ignoreDexes: [],
      partner: "",
      da: [],
      hop: true,
    });
  });

  it("returns failure on malformed response", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenList),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ quantityB: "not-a-number" }),
      });
    const results = await steelswapReadOnlyAdapter.getQuotes(makeRequest());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
  });

  it("handles empty splitGroup gracefully", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenList),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ...mockSuccessResponse, splitGroup: [] }),
      });
    const request = makeRequest();
    const results = await steelswapReadOnlyAdapter.getQuotes(request);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    if (results[0].ok) {
      expect(results[0].routeHops).toHaveLength(1);
      expect(results[0].routeHops[0].venue).toBe("Steelswap");
    }
  });
});
