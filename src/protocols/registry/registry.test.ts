import { describe, it, expect } from "vitest";
import {
  PoolRegistry,
  fromMinswapV2,
  fromMinswapStable,
  fromSundaeSwapV3,
  fromWingRidersV2,
  fromSplash,
  fromVyFinance,
  fromMuesliSwap,
  PROTOCOL_FEE_DEFAULTS,
} from "./registry";
import { quoteSnapshotExactIn, snapshotSupportsPair } from "./poolSnapshot";
import { quoteExactIn as qMinswapV2 } from "../minswapV2/quote";
import { quoteExactInByAsset as qStable } from "../minswapStable/quote";
import { quoteExactIn as qSundae } from "../sundaeswapV3/quote";
import { quoteExactIn as qWingriders } from "../wingRidersV2/quote";
import { quoteExactIn as qSplash } from "../splash/quote";
import { quoteExactIn as qVyFinance } from "../vyfinance/quote";
import { quoteExactIn as qMuesliSwap } from "../muesliswap/quote";

const ADA = "lovelace";
const USDM = "c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d";
const MIN = "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e";
const META = { fetchedAt: "2026-06-12T00:00:00.000Z", fetchedAtSlot: 100_000_000 };

const minswapV2Pool = {
  poolId: "msv2-ada-min",
  assetA: ADA,
  assetB: MIN,
  reserveA: 5_000_000_000_000n,
  reserveB: 2_500_000_000_000n,
  baseFeeANumerator: 30n,
  baseFeeBNumerator: 30n,
  feeDenominator: 10000n,
};

const wingPool = {
  poolId: "wr2-ada-usdm",
  assetA: ADA,
  assetB: USDM,
  reserveA: 4_000_000_000_000n,
  reserveB: 3_960_000_000_000n,
  treasuryA: 1_000_000n,
  treasuryB: 2_000_000n,
  stakingRewardsAda: 500_000n,
  feeBasisPoints: 35n,
  adaIsAssetA: true,
  adaIsAssetB: false,
};

const sundaePool = {
  poolId: "ssv3-ada-usdm",
  assetA: ADA,
  assetB: USDM,
  reserveA: 6_000_000_000_000n,
  reserveB: 5_940_000_000_000n,
  bidFeePer10k: 30n,
  askFeePer10k: 30n,
  protocolFees: 1_280_000n,
  adaIsAssetA: true,
};

const stablePool = {
  poolId: "msstable-usdm-iusd",
  assets: [USDM, "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880069555344"],
  balances: [1_000_000_000_000n, 1_000_000_000_000n],
  multiples: [1n, 1n],
  amp: 100n,
  tradeFeeNumerator: 1_000_000n,
  feeDenominator: 10_000_000_000n,
};

const splashPool = {
  poolId: "splash-ada-min",
  assetA: ADA,
  assetB: MIN,
  reserveA: 3_000_000_000_000n,
  reserveB: 1_500_000_000_000n,
  lpFee: 997n,
  feeDenominator: 1000n,
};

const vyFinancePool = {
  poolId: "vyfi-ada-usdm",
  assetA: ADA,
  assetB: USDM,
  reserveA: 2_000_000_000_000n,
  reserveB: 1_000_000_000_000n,
  feeBasisPoints: 30n,
};

const muesliPool = {
  poolId: "muesli-ada-min",
  assetA: ADA,
  assetB: MIN,
  reserveA: 4_000_000_000_000n,
  reserveB: 2_100_000_000_000n,
  feeNumerator: 30n,
  feeDenominator: 10000n,
};

describe("PoolSnapshot adapters + uniform quote dispatch", () => {
  it("Minswap V2 dispatch equals direct quote", () => {
    const snap = fromMinswapV2(minswapV2Pool, META);
    const amountIn = 1_000_000_000n;
    expect(quoteSnapshotExactIn(snap, ADA, MIN, amountIn)).toBe(
      qMinswapV2(minswapV2Pool, ADA, amountIn),
    );
    expect(snap.assets).toEqual([ADA, MIN]);
    expect(snap.reserves).toEqual([5_000_000_000_000n, 2_500_000_000_000n]);
    expect(snap.settlementClass).toBe("batcher");
  });

  it("WingRiders V2 dispatch equals direct quote and uses true reserves", () => {
    const snap = fromWingRidersV2(wingPool, META);
    const amountIn = 2_000_000_000n;
    expect(quoteSnapshotExactIn(snap, ADA, USDM, amountIn)).toBe(
      qWingriders(wingPool, ADA, amountIn),
    );
    // true reserve A = 4e12 - treasuryA(1e6) - stakingAda(5e5)
    expect(snap.reserves[0]).toBe(4_000_000_000_000n - 1_000_000n - 500_000n);
  });

  it("SundaeSwap V3 dispatch equals direct quote (slot-aware)", () => {
    const snap = fromSundaeSwapV3(sundaePool, META);
    const amountIn = 3_000_000_000n;
    expect(quoteSnapshotExactIn(snap, ADA, USDM, amountIn, { currentSlot: META.fetchedAtSlot })).toBe(
      qSundae(sundaePool, ADA, amountIn, META.fetchedAtSlot),
    );
    // display reserve A net of protocol fees
    expect(snap.reserves[0]).toBe(6_000_000_000_000n - 1_280_000n);
  });

  it("Minswap Stableswap dispatch equals direct quote", () => {
    const snap = fromMinswapStable(stablePool, META);
    const amountIn = 1_000_000_000n;
    expect(quoteSnapshotExactIn(snap, stablePool.assets[0], stablePool.assets[1], amountIn)).toBe(
      qStable(stablePool, stablePool.assets[0], stablePool.assets[1], amountIn),
    );
    expect(snap.assets.length).toBe(2);
  });

  it("Splash dispatch equals direct classic CFMM quote", () => {
    const snap = fromSplash(splashPool, META);
    const amountIn = 1_000_000_000n;
    expect(quoteSnapshotExactIn(snap, ADA, MIN, amountIn)).toBe(
      qSplash(splashPool, ADA, amountIn),
    );
    expect(snap.nominalFeeBps).toBe(30);
  });

  it("VyFinance dispatch equals direct quote", () => {
    const snap = fromVyFinance(vyFinancePool, META);
    const amountIn = 1_000_000_000n;
    expect(quoteSnapshotExactIn(snap, ADA, USDM, amountIn)).toBe(
      qVyFinance(vyFinancePool, ADA, amountIn),
    );
    expect(snap.nominalFeeBps).toBe(30);
  });

  it("MuesliSwap dispatch equals direct pool quote", () => {
    const snap = fromMuesliSwap(muesliPool, META);
    const amountIn = 1_000_000_000n;
    expect(quoteSnapshotExactIn(snap, ADA, MIN, amountIn)).toBe(
      qMuesliSwap(muesliPool, ADA, amountIn),
    );
    expect(snap.nominalFeeBps).toBe(30);
  });

  it("applies per-protocol batcher fee + min-ADA defaults, allows override", () => {
    const snap = fromSundaeSwapV3(sundaePool, META);
    expect(snap.batcherFeeLovelace).toBe(PROTOCOL_FEE_DEFAULTS.sundaeswapV3.batcherFeeLovelace);
    const overridden = fromSundaeSwapV3(sundaePool, { ...META, batcherFeeLovelace: 9_999n });
    expect(overridden.batcherFeeLovelace).toBe(9_999n);
  });

  it("rejects unsupported pairs in dispatch", () => {
    const snap = fromMinswapV2(minswapV2Pool, META);
    expect(snapshotSupportsPair(snap, ADA, USDM)).toBe(false);
    expect(() => quoteSnapshotExactIn(snap, ADA, USDM, 1n)).toThrow();
  });
});

describe("PoolRegistry", () => {
  it("indexes and looks up pools by pair across protocols", () => {
    const reg = new PoolRegistry();
    reg.upsertAll([
      fromMinswapV2(minswapV2Pool, META),
      fromWingRidersV2(wingPool, META),
      fromSundaeSwapV3(sundaePool, META),
      fromMinswapStable(stablePool, META),
      fromSplash(splashPool, META),
      fromVyFinance(vyFinancePool, META),
      fromMuesliSwap(muesliPool, META),
    ]);
    expect(reg.size()).toBe(7);

    const adaUsdm = reg.poolsForPair(ADA, USDM);
    expect(adaUsdm.map((s) => s.id).sort()).toEqual(["ssv3-ada-usdm", "vyfi-ada-usdm", "wr2-ada-usdm"]);

    const adaMin = reg.poolsForPair(MIN, ADA); // unordered
    expect(adaMin.map((s) => s.id).sort()).toEqual(["msv2-ada-min", "muesli-ada-min", "splash-ada-min"]);

    expect(reg.byProtocol("minswapStable").map((s) => s.id)).toEqual(["msstable-usdm-iusd"]);
  });

  it("upsert replaces on same pool id (latest write wins)", () => {
    const reg = new PoolRegistry();
    reg.upsert(fromMinswapV2(minswapV2Pool, META));
    reg.upsert(fromMinswapV2({ ...minswapV2Pool, reserveB: 9n }, META));
    expect(reg.size()).toBe(1);
    expect(reg.get("msv2-ada-min")?.reserves[1]).toBe(9n);
  });
});
