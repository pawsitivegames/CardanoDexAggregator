import { describe, expect, it } from "vitest";
import { ASSETS, LOVELACE_ASSET_ID } from "./assets";
import { decideRoutes } from "./quoteEngine";
import type { QuoteRequest, RouteCandidate } from "./routes";

const snek = ASSETS.find((asset) => asset.symbol === "SNEK")!;
const min = ASSETS.find((asset) => asset.symbol === "MIN")!;
const now = new Date("2026-06-11T12:00:00.000Z");

const baseRequest: QuoteRequest = {
  inputAssetId: LOVELACE_ASSET_ID,
  outputAssetId: snek.id,
  amountIn: 1_000,
  slippageTolerancePct: 0.5,
  network: "preview",
};

function candidate(overrides: Partial<RouteCandidate> & Pick<RouteCandidate, "id" | "grossOutput">): RouteCandidate {
  return {
    label: overrides.id,
    source: {
      adapterId: "test",
      adapterName: "Test adapter",
      quoteMode: "fixture",
    },
    network: "preview",
    inputAssetId: baseRequest.inputAssetId,
    outputAssetId: baseRequest.outputAssetId,
    fees: {
      dexFeeAda: 0,
      batcherFeeAda: 0,
      networkFeeAda: 0,
      aggregatorFeeAda: 0,
      minAdaRequirement: 0,
    },
    hops: [
      {
        venue: overrides.id,
        inputAssetId: baseRequest.inputAssetId,
        outputAssetId: baseRequest.outputAssetId,
      },
    ],
    quoteTimestamp: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    executable: true,
    priceImpactPct: 0.1,
    confidencePct: 95,
    note: "Test route",
    ...overrides,
  };
}

describe("decideRoutes", () => {
  it("selects the best route by net output, not gross output", () => {
    const decision = decideRoutes(
      baseRequest,
      [
        candidate({
          id: "gross-winner",
          grossOutput: 1_100,
          fees: { dexFeeAda: 50, batcherFeeAda: 100, networkFeeAda: 0, aggregatorFeeAda: 0, minAdaRequirement: 0 },
        }),
        candidate({ id: "net-winner", grossOutput: 1_000 }),
      ],
      [],
      { now },
    );

    expect(decision.selectedRoute?.id).toBe("net-winner");
    expect(decision.rejectedRoutes.find((route) => route.id === "gross-winner")?.rejectionReason).toBe("worse_net_output");
  });

  it("lets fees flip the selected route", () => {
    const lowFee = decideRoutes(
      baseRequest,
      [
        candidate({ id: "a", grossOutput: 1_000 }),
        candidate({ id: "b", grossOutput: 990 }),
      ],
      [],
      { now },
    );
    const highFee = decideRoutes(
      baseRequest,
      [
        candidate({
          id: "a",
          grossOutput: 1_000,
          fees: { dexFeeAda: 0, batcherFeeAda: 100, networkFeeAda: 0, aggregatorFeeAda: 0, minAdaRequirement: 0 },
        }),
        candidate({ id: "b", grossOutput: 990 }),
      ],
      [],
      { now },
    );

    expect(lowFee.selectedRoute?.id).toBe("a");
    expect(highFee.selectedRoute?.id).toBe("b");
  });

  it("requires complex routes to beat the improvement buffer", () => {
    const decision = decideRoutes(
      baseRequest,
      [
        candidate({ id: "direct", grossOutput: 1_000 }),
        candidate({
          id: "complex",
          grossOutput: 1_000.5,
          hops: [
            { venue: "A", inputAssetId: baseRequest.inputAssetId, outputAssetId: min.id },
            { venue: "B", inputAssetId: min.id, outputAssetId: baseRequest.outputAssetId },
          ],
        }),
      ],
      [],
      { improvementBufferPct: 0.1, now },
    );

    expect(decision.selectedRoute?.id).toBe("direct");
    expect(decision.rejectedRoutes.find((route) => route.id === "complex")?.rejectionReason).toBe("below_improvement_buffer");
  });

  it("rejects stale quotes", () => {
    const decision = decideRoutes(
      baseRequest,
      [
        candidate({ id: "fresh", grossOutput: 1_000 }),
        candidate({
          id: "stale",
          grossOutput: 2_000,
          quoteTimestamp: "2026-06-11T11:00:00.000Z",
          maxAgeMs: 30_000,
        }),
      ],
      [],
      { now },
    );

    expect(decision.selectedRoute?.id).toBe("fresh");
    expect(decision.rejectedRoutes.find((route) => route.id === "stale")?.rejectionReason).toBe("stale_quote");
  });

  it("rejects failed sources", () => {
    const decision = decideRoutes(
      baseRequest,
      [candidate({ id: "fresh", grossOutput: 1_000 })],
      [
        {
          id: "failed",
          label: "Failed venue",
          source: { adapterId: "failed", adapterName: "Failed adapter", quoteMode: "fixture" },
          network: "preview",
          inputAssetId: baseRequest.inputAssetId,
          outputAssetId: baseRequest.outputAssetId,
          reason: "failed_source",
          message: "Provider failed.",
        },
      ],
      { now },
    );

    expect(decision.selectedRoute?.id).toBe("fresh");
    expect(decision.rejectedRoutes.find((route) => route.id === "failed")?.rejectionReason).toBe("failed_source");
  });

  it("rejects non-executable routes when executable flow is required", () => {
    const decision = decideRoutes(
      baseRequest,
      [
        candidate({
          id: "read-only",
          grossOutput: 2_000,
          executable: false,
        }),
        candidate({
          id: "executable",
          grossOutput: 1_000,
          executable: true,
        }),
      ],
      [],
      { now, requireExecutable: true },
    );

    expect(decision.selectedRoute?.id).toBe("executable");
    expect(decision.rejectedRoutes.find((route) => route.id === "read-only")?.rejectionReason).toBe("non_executable_route");
  });

  it("returns typed invalid request failures", () => {
    const cases: QuoteRequest[] = [
      { ...baseRequest, amountIn: 0 },
      { ...baseRequest, amountIn: -1 },
      { ...baseRequest, outputAssetId: baseRequest.inputAssetId },
      { ...baseRequest, outputAssetId: "unknown" },
    ];

    for (const request of cases) {
      const decision = decideRoutes(request, [], [], { now });
      expect(decision.status).toBe("invalid");
      expect(decision.rejectedRoutes[0].rejectionReason).toBe("invalid_request");
    }
  });

  it("uses a deterministic tie-break", () => {
    const routes = [
      candidate({ id: "b-route", grossOutput: 1_000 }),
      candidate({ id: "a-route", grossOutput: 1_000 }),
    ];

    expect(decideRoutes(baseRequest, routes, [], { now }).selectedRoute?.id).toBe("a-route");
    expect(decideRoutes(baseRequest, [...routes].reverse(), [], { now }).selectedRoute?.id).toBe("a-route");
  });
});
