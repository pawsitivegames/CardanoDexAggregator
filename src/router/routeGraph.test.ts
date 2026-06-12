import { describe, it, expect } from "vitest";
import { buildLegs, DEFAULT_CONNECTORS } from "./routeGraph";
import { routeSplit } from "./splitRouter";
import {
  PoolRegistry,
  fromMinswapV2,
  fromSundaeSwapV3,
  fromMinswapStable,
} from "../protocols/registry/registry";

const ADA = "lovelace";
const USDM = "c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d";
const IUSD = "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880069555344";
const MIN = "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e";
const META = { fetchedAt: "2026-06-12T00:00:00.000Z" };

function registryWith2Hop(): PoolRegistry {
  const reg = new PoolRegistry();
  // ADA <-> USDM (SundaeSwap V3), ADA <-> MIN (Minswap V2), USDM <-> iUSD (stable).
  reg.upsert(
    fromSundaeSwapV3(
      {
        poolId: "ssv3-ada-usdm",
        assetA: ADA,
        assetB: USDM,
        reserveA: 6_000_000_000_000n,
        reserveB: 5_940_000_000_000n,
        bidFeePer10k: 30n,
        askFeePer10k: 30n,
        protocolFees: 0n,
        adaIsAssetA: true,
      },
      META,
    ),
  );
  reg.upsert(
    fromMinswapV2(
      {
        poolId: "msv2-ada-min",
        assetA: ADA,
        assetB: MIN,
        reserveA: 5_000_000_000_000n,
        reserveB: 2_500_000_000_000n,
        baseFeeANumerator: 30n,
        baseFeeBNumerator: 30n,
        feeDenominator: 10000n,
      },
      META,
    ),
  );
  reg.upsert(
    fromMinswapStable(
      {
        poolId: "msstable-usdm-iusd",
        assets: [USDM, IUSD],
        balances: [3_000_000_000_000n, 3_000_000_000_000n],
        multiples: [1n, 1n],
        amp: 100n,
        tradeFeeNumerator: 1_000_000n,
        feeDenominator: 10_000_000_000n,
      },
      META,
    ),
  );
  return reg;
}

describe("buildLegs", () => {
  it("finds direct legs for a pair", () => {
    const reg = registryWith2Hop();
    const legs = buildLegs(reg, ADA, USDM, { maxHops: 1 });
    expect(legs.map((l) => l.id)).toEqual(["ssv3-ada-usdm"]);
    expect(legs[0].hops.length).toBe(1);
  });

  it("discovers a 2-hop leg through a connector when no direct pool exists", () => {
    const reg = registryWith2Hop();
    // No direct ADA<->iUSD pool; only ADA->USDM->iUSD exists.
    const direct = buildLegs(reg, ADA, IUSD, { maxHops: 1 });
    expect(direct.length).toBe(0);

    const legs = buildLegs(reg, ADA, IUSD); // default maxHops=2
    const twoHop = legs.find((l) => l.id === "ssv3-ada-usdm>msstable-usdm-iusd");
    expect(twoHop).toBeDefined();
    expect(twoHop!.hops.map((h) => [h.assetIn, h.assetOut])).toEqual([
      [ADA, USDM],
      [USDM, IUSD],
    ]);
    // The 2-hop leg actually produces output.
    expect(twoHop!.quote(1_000_000_000n)).toBeGreaterThan(0n);
  });

  it("does not use the same pool for both hops", () => {
    const reg = registryWith2Hop();
    const legs = buildLegs(reg, ADA, IUSD);
    for (const leg of legs) {
      const ids = leg.hops.map((h) => h.snapshot.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("skips connectors equal to the input or output asset", () => {
    const reg = registryWith2Hop();
    // ADA is a connector but also the input — must not produce ADA->ADA->X legs.
    const legs = buildLegs(reg, ADA, USDM);
    expect(legs.every((l) => l.hops.every((h) => h.assetIn !== h.assetOut))).toBe(true);
    expect(DEFAULT_CONNECTORS).toContain(ADA);
  });

  it("routeSplit routes an end-to-end 2-hop trade", () => {
    const reg = registryWith2Hop();
    const legs = buildLegs(reg, ADA, IUSD);
    const r = routeSplit(legs, 2_000_000_000n);
    expect(r.grossOutput).toBeGreaterThan(0n);
    expect(r.allocations.length).toBeGreaterThanOrEqual(1);
    expect(r.allocations.reduce((a, b) => a + b.amountIn, 0n)).toBe(2_000_000_000n);
  });
});
