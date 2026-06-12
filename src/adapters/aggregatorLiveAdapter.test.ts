import { describe, expect, it, vi } from "vitest";
import { createAggregatorLiveAdapter } from "./aggregatorLiveAdapter";
import type { QuoteRequest } from "../domain/routes";
import { LOVELACE_ASSET_ID } from "../domain/assets";

const adaToMinConfig = {
  id: "minswap-v2",
  displayName: "Minswap V2",
  protocol: "MinswapV2",
  pair: {
    inputAssetId: LOVELACE_ASSET_ID,
    outputAssetId: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e",
  },
};

const baseRequest: QuoteRequest = {
  inputAssetId: adaToMinConfig.pair.inputAssetId,
  outputAssetId: adaToMinConfig.pair.outputAssetId,
  amountIn: 100,
  slippageTolerancePct: 0.5,
  network: "mainnet",
};

const validEstimateResponse = {
  token_in: "lovelace",
  token_out: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e",
  amount_in: "100",
  amount_out: "50000",
  min_amount_out: "49750",
  total_lp_fee: "10",
  total_dex_fee: "2",
  deposits: "2",
  avg_price_impact: 0.5,
  aggregator_fee: "0",
  paths: [
    [
      {
        pool_id: "pool1",
        protocol: "MinswapV2",
        token_in: "lovelace",
        token_out: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e",
        amount_in: "100",
        amount_out: "50000",
        lp_fee: "10",
        dex_fee: "2",
        deposits: "2",
        price_impact: 0.5,
      },
    ],
  ],
  amount_in_decimal: true,
};

describe("createAggregatorLiveAdapter", () => {
  const adapter = createAggregatorLiveAdapter(adaToMinConfig);

  it("returns unsupported_pair failure for wrong input asset", async () => {
    const request = { ...baseRequest, inputAssetId: "wrong-asset-id" };
    const results = await adapter.getQuotes(request, new Date());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (results[0].ok) throw new Error();
    expect(results[0].reason).toBe("unsupported_pair");
  });

  it("returns unsupported_pair failure for wrong network", async () => {
    const request = { ...baseRequest, network: "preprod" as const };
    const results = await adapter.getQuotes(request, new Date());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (results[0].ok) throw new Error();
    expect(results[0].reason).toBe("unsupported_pair");
  });

  it("returns failed_source on HTTP error", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const results = await adapter.getQuotes(baseRequest, new Date());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (results[0].ok) throw new Error();
    expect(results[0].reason).toBe("failed_source");
    fetchSpy.mockRestore();
  });

  it("returns failed_source on network error", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const results = await adapter.getQuotes(baseRequest, new Date());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (results[0].ok) throw new Error();
    expect(results[0].reason).toBe("failed_source");
    fetchSpy.mockRestore();
  });

  it("returns failed_source for malformed response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ amount_out: "50000" }),
    } as Response);

    const results = await adapter.getQuotes(baseRequest, new Date());
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (results[0].ok) throw new Error();
    expect(results[0].reason).toBe("failed_source");
    fetchSpy.mockRestore();
  });

  it("normalizes a valid estimate response into a success result", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => validEstimateResponse,
    } as Response);

    const now = new Date("2026-06-11T12:00:00.000Z");
    const results = await adapter.getQuotes(baseRequest, now);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    if (!results[0].ok) throw new Error();
    expect(results[0].quoteMode).toBe("live");
    expect(results[0].executable).toBe(false);
    expect(results[0].adapterId).toBe("minswap-v2");
    expect(results[0].grossOutput).toBe(0.05);
    expect(results[0].routeHops).toHaveLength(1);
    expect(results[0].routeHops[0].venue).toBe("MinswapV2");
    expect(results[0].quoteTimestamp).toBe(now.toISOString());
    fetchSpy.mockRestore();
  });

  it("sets adapterId and adapterName from config", () => {
    const customAdapter = createAggregatorLiveAdapter({
      id: "sundaeswap-v3",
      displayName: "SundaeSwap V3",
      protocol: "SundaeSwapV3",
      pair: adaToMinConfig.pair,
    });
    expect(customAdapter.id).toBe("sundaeswap-v3");
    expect(customAdapter.displayName).toBe("SundaeSwap V3");
  });
});
