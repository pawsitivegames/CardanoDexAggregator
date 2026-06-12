import { describe, expect, it } from "vitest";
import { EXECUTABLE_NETWORK, FIRST_LIVE_PAIR, LIVE_QUOTE_NETWORK } from "../config/networks";
import { decideRoutes } from "../domain/quoteEngine";
import { adapterFailureFixture, adapterSuccessFixture, fixtureRequest } from "./fixtures";
import { minswapAdaSnekEstimateFixture } from "./minswapLiveFixtures";
import { normalizeMinswapEstimate } from "./minswapLiveAdapter";
import { mockAdapter } from "./mockAdapter";
import { normalizeAdapterSuccess } from "./types";

describe("quote adapters", () => {
  it("normalizes adapter success fixtures into route candidates", () => {
    const candidate = normalizeAdapterSuccess(adapterSuccessFixture);

    expect(candidate.id).toBe("fixture-success");
    expect(candidate.source.quoteMode).toBe("fixture");
    expect(candidate.fees.dexFeeAda).toBe(3);
  });

  it("normalizes adapter failures into rejected routes", () => {
    const decision = decideRoutes(
      fixtureRequest,
      [normalizeAdapterSuccess(adapterSuccessFixture)],
      [
        {
          id: adapterFailureFixture.routeId,
          label: adapterFailureFixture.label,
          source: {
            adapterId: adapterFailureFixture.adapterId,
            adapterName: adapterFailureFixture.adapterName,
            quoteMode: adapterFailureFixture.quoteMode,
          },
          network: adapterFailureFixture.network,
          inputAssetId: adapterFailureFixture.inputAssetId,
          outputAssetId: adapterFailureFixture.outputAssetId,
          reason: adapterFailureFixture.reason,
          message: adapterFailureFixture.message,
        },
      ],
      { now: new Date("2026-06-11T12:00:10.000Z") },
    );

    expect(decision.selectedRoute?.id).toBe("fixture-success");
    expect(decision.rejectedRoutes.find((route) => route.id === "fixture-failure")?.rejectionReason).toBe("failed_source");
  });

  it("powers the current mock UI contract with success and failure results", () => {
    const results = mockAdapter.getQuotes(fixtureRequest, new Date("2026-06-11T12:00:00.000Z"));

    expect(results.some((result) => result.ok)).toBe(true);
    expect(results.some((result) => !result.ok && result.reason === "failed_source")).toBe(true);
  });

  it("normalizes a saved Minswap live estimate fixture", () => {
    const result = normalizeMinswapEstimate(
      {
        ...fixtureRequest,
        inputAssetId: FIRST_LIVE_PAIR.inputAssetId,
        outputAssetId: FIRST_LIVE_PAIR.outputAssetId,
        network: LIVE_QUOTE_NETWORK,
      },
      minswapAdaSnekEstimateFixture,
      new Date("2026-06-11T12:00:00.000Z"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.quoteMode).toBe("live");
    expect(result.executable).toBe(false);
    expect(result.routeHops[0].venue).toBe("MinswapV2");
    expect(result.grossOutput).toBe(463906);
  });

  it("fails closed for malformed Minswap estimates", () => {
    const result = normalizeMinswapEstimate(
      {
        ...fixtureRequest,
        inputAssetId: FIRST_LIVE_PAIR.inputAssetId,
        outputAssetId: FIRST_LIVE_PAIR.outputAssetId,
        network: LIVE_QUOTE_NETWORK,
      },
      { ...minswapAdaSnekEstimateFixture, amount_out: undefined },
      new Date("2026-06-11T12:00:00.000Z"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected malformed response to fail.");
    expect(result.reason).toBe("failed_source");
  });

  it("fails closed for unsupported live pairs", () => {
    const result = normalizeMinswapEstimate(
      {
        ...fixtureRequest,
        inputAssetId: fixtureRequest.outputAssetId,
        outputAssetId: fixtureRequest.inputAssetId,
        network: LIVE_QUOTE_NETWORK,
      },
      minswapAdaSnekEstimateFixture,
      new Date("2026-06-11T12:00:00.000Z"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected unsupported pair to fail.");
    expect(result.reason).toBe("unsupported_pair");
  });

  it("mock adapter returns executable routes for preprod pair", () => {
    const results = mockAdapter.getQuotes(
      {
        ...fixtureRequest,
        network: EXECUTABLE_NETWORK,
      },
      new Date("2026-06-12T12:00:00.000Z"),
    );

    const executable = results.filter((r) => r.ok && r.executable);
    expect(executable.length).toBeGreaterThanOrEqual(5);
    const labels = executable.map((r) => (r.ok ? r.label : ""));
    expect(labels).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Minswap"),
        expect.stringContaining("DexHunter"),
        expect.stringContaining("Steelswap"),
        expect.stringContaining("Cardexscan"),
        expect.stringContaining("SaturnSwap"),
      ]),
    );
  });
});
