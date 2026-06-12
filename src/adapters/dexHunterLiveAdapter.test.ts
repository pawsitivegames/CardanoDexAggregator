import { describe, it, expect, vi, beforeEach } from "vitest";
import { dexHunterReadOnlyAdapter } from "./dexHunterLiveAdapter";
import { LOVELACE_ASSET_ID } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";

function makeRequest(overrides?: Partial<QuoteRequest>): QuoteRequest {
  return {
    inputAssetId: LOVELACE_ASSET_ID,
    outputAssetId: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
    amountIn: 1000,
    slippageTolerancePct: 1,
    network: "mainnet",
    ...overrides,
  };
}

const mockSuccessResponse = {
  splits: [
    {
      dex: "MINSWAPV2",
      amount_in: 1000,
      expected_output: 403441,
      expected_output_without_slippage: 414562,
      fee: 4,
      price_impact: 0.0777,
      batcher_fee: 2,
      deposits: 2,
    },
  ],
  total_output: 403441,
  total_output_without_slippage: 414562,
  total_fee: 2,
  batcher_fee: 2,
  dexhunter_fee: 0,
  deposits: 2,
  partner_fee: 2,
  net_price_reverse: 414.562,
};

describe("dexHunterReadOnlyAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns failure for non-mainnet network", async () => {
    const request = makeRequest({ network: "preprod" });
    const results = await dexHunterReadOnlyAdapter.getQuotes(request);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].reason).toBe("unsupported_pair");
    }
  });

  it("returns failure on HTTP error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const results = await dexHunterReadOnlyAdapter.getQuotes(makeRequest());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].reason).toBe("failed_source");
    }
  });

  it("returns success with parsed gross output and fees", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse),
    });
    const request = makeRequest();
    const results = await dexHunterReadOnlyAdapter.getQuotes(request);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    if (results[0].ok) {
      expect(results[0].adapterId).toBe("dexhunter-live-readonly");
      expect(results[0].quoteMode).toBe("live");
      expect(results[0].executable).toBe(false);
      expect(results[0].grossOutput).toBeCloseTo(417049.372, 2);
      expect(results[0].feeBreakdown.batcherFeeAda).toBe(2);
      expect(results[0].feeBreakdown.minAdaRequirement).toBe(2);
      expect(results[0].feeBreakdown.aggregatorFeeAda).toBe(2);
      expect(results[0].routeHops).toHaveLength(1);
      expect(results[0].routeHops[0].venue).toBe("MINSWAPV2");
    }
  });

  it("returns failure on malformed response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ total_output: "not-a-number" }),
    });
    const results = await dexHunterReadOnlyAdapter.getQuotes(makeRequest());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
  });

  it("handles multi-split responses", async () => {
    const multiSplit = {
      ...mockSuccessResponse,
      splits: [
        { dex: "MINSWAPV2", amount_in: 600, expected_output: 250000, expected_output_without_slippage: 260000, fee: 2, price_impact: 0.05, batcher_fee: 1, deposits: 1 },
        { dex: "SUNDAESWAP", amount_in: 400, expected_output: 150000, expected_output_without_slippage: 154562, fee: 2, price_impact: 0.1, batcher_fee: 1, deposits: 1 },
      ],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(multiSplit),
    });
    const results = await dexHunterReadOnlyAdapter.getQuotes(makeRequest());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    if (results[0].ok) {
      expect(results[0].routeHops).toHaveLength(2);
      expect(results[0].routeHops[1].venue).toBe("SUNDAESWAP");
    }
  });
});
