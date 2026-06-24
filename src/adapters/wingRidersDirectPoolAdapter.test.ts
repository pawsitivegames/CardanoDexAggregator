import { describe, expect, it, vi } from "vitest";
import { LOVELACE_ASSET_ID } from "../domain/assets";
import type { QuoteRequest } from "../domain/routes";
import { wingRidersV2DirectPoolAdapter } from "./wingRidersDirectPoolAdapter";

const request: QuoteRequest = {
  inputAssetId: LOVELACE_ASSET_ID,
  outputAssetId: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
  amountIn: 100,
  slippageTolerancePct: 0.5,
  network: "mainnet",
};

const poolResponse = {
  data: {
    liquidityPoolById: {
      version: "V2",
      poolType: "CONSTANT_PRODUCT",
      tokenA: {
        policyId: "",
        assetName: "",
        quantity: "155556956495",
      },
      tokenB: {
        policyId: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f",
        assetName: "534e454b",
        quantity: "68823917",
      },
      tvlInAda: "311113912990",
    },
  },
};

describe("wingRidersV2DirectPoolAdapter", () => {
  it("returns a live WingRiders V2 direct pool quote", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => poolResponse,
    } as Response);

    const results = await wingRidersV2DirectPoolAdapter.getQuotes(request, new Date("2026-06-12T12:00:00.000Z"));

    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    if (!results[0].ok) throw new Error();
    expect(results[0].adapterId).toBe("wingriders-v2-direct-pool");
    expect(results[0].label).toBe("WingRiders V2 direct pool");
    expect(results[0].routeHops[0].venue).toBe("WingRidersV2");
    expect(results[0].grossOutput).toBeGreaterThan(44_000);
    expect(results[0].poolReserveIn).toBeCloseTo(155_556.956495);
    expect(results[0].poolReserveOut).toBe(68_823_917);
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)).variables.poolAsset.policyId).toBe(
      "6fdc63a1d71dc2c65502b79baae7fb543185702b12c3c5fb639ed737",
    );
    fetchSpy.mockRestore();
  });

  it("fails closed when WingRiders does not return the V2 constant-product pool", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: { liquidityPoolById: { ...poolResponse.data.liquidityPoolById, version: "V1" } } }),
    } as Response);

    const results = await wingRidersV2DirectPoolAdapter.getQuotes(request);

    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (results[0].ok) throw new Error();
    expect(results[0].reason).toBe("failed_source");
    fetchSpy.mockRestore();
  });

  it("does not run on non-mainnet", async () => {
    const results = await wingRidersV2DirectPoolAdapter.getQuotes({ ...request, network: "preprod" });
    expect(results).toEqual([]);
  });
});
