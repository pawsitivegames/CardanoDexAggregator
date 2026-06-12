import { describe, expect, it } from "vitest";
import { ASSETS, LOVELACE_ASSET_ID } from "./assets";
import { decideRoutes } from "./quoteEngine";
import type { QuoteRequest, RouteCandidate } from "./routes";
import { comparePreviewToRefreshedRoute, createTransactionPreview } from "./transactions";

const snek = ASSETS.find((asset) => asset.symbol === "SNEK")!;
const now = new Date("2026-06-11T12:00:00.000Z");

const request: QuoteRequest = {
  inputAssetId: LOVELACE_ASSET_ID,
  outputAssetId: snek.id,
  amountIn: 10,
  slippageTolerancePct: 0.5,
  network: "preprod",
};

function route(overrides: Partial<RouteCandidate> = {}): RouteCandidate {
  return {
    id: "preprod-direct",
    label: "Preprod direct",
    source: { adapterId: "fixture", adapterName: "Fixture DEX", quoteMode: "fixture" },
    network: "preprod",
    inputAssetId: request.inputAssetId,
    outputAssetId: request.outputAssetId,
    grossOutput: 1000,
    fees: {
      dexFeeAda: 0.1,
      batcherFeeAda: 0.1,
      networkFeeAda: 0.2,
      aggregatorFeeAda: 0,
      minAdaRequirement: 0,
    },
    hops: [{ venue: "Fixture DEX", inputAssetId: request.inputAssetId, outputAssetId: request.outputAssetId }],
    quoteTimestamp: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    executable: true,
    priceImpactPct: 0.2,
    confidencePct: 90,
    note: "Executable fixture route.",
    ...overrides,
  };
}

describe("transaction preview proof", () => {
  it("builds a ready preview for an executable non-mainnet route", () => {
    const decision = decideRoutes(request, [route()], [], { now, requireExecutable: true });
    const preview = createTransactionPreview(
      decision,
      {
        status: "connected",
        walletName: "Test wallet",
        networkName: "testnet",
        networkId: 0,
        blockers: [],
      },
      now,
    );

    expect(preview.status).toBe("ready");
    expect(preview.network).toBe("preprod");
    expect(preview.selectedDex).toBe("Preprod direct");
    expect(preview.minimumReceived).toBeLessThan(preview.expectedOutput);
  });

  it("blocks read-only or mainnet previews", () => {
    const mainnetDecision = decideRoutes(
      { ...request, network: "mainnet" },
      [route({ network: "mainnet", executable: false })],
      [],
      { now },
    );
    const preview = createTransactionPreview(mainnetDecision, { status: "disconnected" }, now);

    expect(preview.status).toBe("blocked");
    expect(preview.blockers).toContain("Selected route is read-only and cannot enter signing flow.");
    expect(preview.blockers).toContain("Executable swaps require a non-mainnet route.");
    expect(preview.blockers).toContain("Connect a wallet before transaction preview.");
  });

  it("requires refreshed route to match the approved preview", () => {
    const decision = decideRoutes(request, [route()], [], { now, requireExecutable: true });
    const preview = createTransactionPreview(
      decision,
      { status: "connected", walletName: "Test wallet", networkName: "testnet", networkId: 0, blockers: [] },
      now,
    );
    const refreshedDecision = decideRoutes(request, [route({ grossOutput: 999 })], [], {
      now: new Date(now.getTime() + 10_000),
      requireExecutable: true,
    });

    expect(comparePreviewToRefreshedRoute(preview, refreshedDecision, new Date(now.getTime() + 10_000))).toEqual({
      status: "match",
    });
  });

  it("blocks refreshed route mismatch and minimum-output breach", () => {
    const decision = decideRoutes(request, [route()], [], { now, requireExecutable: true });
    const preview = createTransactionPreview(
      decision,
      { status: "connected", walletName: "Test wallet", networkName: "testnet", networkId: 0, blockers: [] },
      now,
    );
    const differentRoute = decideRoutes(request, [route({ id: "other-route" })], [], { now, requireExecutable: true });
    const worseRoute = decideRoutes(request, [route({ grossOutput: 500 })], [], { now, requireExecutable: true });

    expect(comparePreviewToRefreshedRoute(preview, differentRoute, now)).toEqual({
      status: "blocked",
      reason: "Refreshed route ID differs from the approved preview.",
    });
    expect(comparePreviewToRefreshedRoute(preview, worseRoute, now)).toEqual({
      status: "blocked",
      reason: "Refreshed output is below the approved minimum received.",
    });
  });
});
