// PoolRegistry + per-protocol snapshot adapters (T1.6). Adapters convert each protocol's
// decoded pool into the unified PoolSnapshot; the registry indexes snapshots for pair
// lookup by the pathfinder (T1.9) and quote engine.

import type { PoolSnapshot, ProtocolId } from "./poolSnapshot";
import { snapshotSupportsPair } from "./poolSnapshot";
import type { MinswapV2Pool } from "../minswapV2/types";
import type { MinswapStablePool } from "../minswapStable/types";
import type { SundaeSwapV3Pool } from "../sundaeswapV3/types";
import type { WingRidersV2Pool } from "../wingRidersV2/types";
import { trueReserves } from "../wingRidersV2/quote";
import type { SplashPool } from "../splash/types";
import type { VyFinancePool } from "../vyfinance/types";
import type { MuesliSwapPool } from "../muesliswap/types";

/**
 * Per-protocol fixed-cost defaults (lovelace). These are batcher/scooper fee + min-ADA
 * constants documented by each DEX; override per-venue from live config when available.
 * They make split-pruning exact (plan T1.9: a split across N venues costs N batcher fees).
 */
export const PROTOCOL_FEE_DEFAULTS: Record<
  ProtocolId,
  { batcherFeeLovelace: bigint; minAdaLovelace: bigint; settlementClass: "batcher" | "direct" }
> = {
  minswapV2: { batcherFeeLovelace: 2_000_000n, minAdaLovelace: 2_000_000n, settlementClass: "batcher" },
  minswapStable: { batcherFeeLovelace: 2_000_000n, minAdaLovelace: 2_000_000n, settlementClass: "batcher" },
  sundaeswapV3: { batcherFeeLovelace: 2_500_000n, minAdaLovelace: 2_000_000n, settlementClass: "batcher" },
  wingRidersV2: { batcherFeeLovelace: 2_000_000n, minAdaLovelace: 2_000_000n, settlementClass: "batcher" },
  splash: { batcherFeeLovelace: 2_000_000n, minAdaLovelace: 2_000_000n, settlementClass: "batcher" },
  vyfinance: { batcherFeeLovelace: 2_000_000n, minAdaLovelace: 2_000_000n, settlementClass: "batcher" },
  muesliswap: { batcherFeeLovelace: 2_000_000n, minAdaLovelace: 2_000_000n, settlementClass: "batcher" },
};

type SnapshotMeta = {
  fetchedAt: string;
  fetchedAtSlot?: number;
  batcherFeeLovelace?: bigint;
  minAdaLovelace?: bigint;
};

function applyDefaults(protocol: ProtocolId, meta: SnapshotMeta) {
  const d = PROTOCOL_FEE_DEFAULTS[protocol];
  return {
    batcherFeeLovelace: meta.batcherFeeLovelace ?? d.batcherFeeLovelace,
    minAdaLovelace: meta.minAdaLovelace ?? d.minAdaLovelace,
    settlementClass: d.settlementClass,
  };
}

export function fromMinswapV2(pool: MinswapV2Pool, meta: SnapshotMeta): PoolSnapshot {
  const nominalFeeBps = Number(pool.baseFeeANumerator) / Number(pool.feeDenominator) * 10000;
  return {
    id: pool.poolId,
    protocol: "minswapV2",
    assets: [pool.assetA, pool.assetB],
    reserves: [pool.reserveA, pool.reserveB],
    nominalFeeBps,
    ...applyDefaults("minswapV2", meta),
    fetchedAt: meta.fetchedAt,
    fetchedAtSlot: meta.fetchedAtSlot,
    raw: { protocol: "minswapV2", pool },
  };
}

export function fromWingRidersV2(pool: WingRidersV2Pool, meta: SnapshotMeta): PoolSnapshot {
  const { a, b } = trueReserves(pool);
  return {
    id: pool.poolId,
    protocol: "wingRidersV2",
    assets: [pool.assetA, pool.assetB],
    reserves: [a, b],
    nominalFeeBps: Number(pool.feeBasisPoints),
    ...applyDefaults("wingRidersV2", meta),
    fetchedAt: meta.fetchedAt,
    fetchedAtSlot: meta.fetchedAtSlot,
    raw: { protocol: "wingRidersV2", pool },
  };
}

export function fromSundaeSwapV3(pool: SundaeSwapV3Pool, meta: SnapshotMeta): PoolSnapshot {
  // Display reserves net of accumulated protocol fees on the ADA side.
  const reserveA = pool.adaIsAssetA ? pool.reserveA - pool.protocolFees : pool.reserveA;
  const reserveB = pool.adaIsAssetA ? pool.reserveB : pool.reserveB - pool.protocolFees;
  return {
    id: pool.poolId,
    protocol: "sundaeswapV3",
    assets: [pool.assetA, pool.assetB],
    reserves: [reserveA, reserveB],
    nominalFeeBps: Number(pool.askFeePer10k) / 10000 * 10000,
    ...applyDefaults("sundaeswapV3", meta),
    fetchedAt: meta.fetchedAt,
    fetchedAtSlot: meta.fetchedAtSlot,
    raw: { protocol: "sundaeswapV3", pool },
  };
}

export function fromMinswapStable(pool: MinswapStablePool, meta: SnapshotMeta): PoolSnapshot {
  const nominalFeeBps = Number(pool.tradeFeeNumerator) / Number(pool.feeDenominator) * 10000;
  return {
    id: pool.poolId,
    protocol: "minswapStable",
    assets: [...pool.assets],
    reserves: [...pool.balances],
    nominalFeeBps,
    ...applyDefaults("minswapStable", meta),
    fetchedAt: meta.fetchedAt,
    fetchedAtSlot: meta.fetchedAtSlot,
    raw: { protocol: "minswapStable", pool },
  };
}

export function fromSplash(pool: SplashPool, meta: SnapshotMeta): PoolSnapshot {
  const nominalFeeBps = Number(pool.feeDenominator - pool.lpFee) / Number(pool.feeDenominator) * 10000;
  return {
    id: pool.poolId,
    protocol: "splash",
    assets: [pool.assetA, pool.assetB],
    reserves: [pool.reserveA, pool.reserveB],
    nominalFeeBps,
    ...applyDefaults("splash", meta),
    fetchedAt: meta.fetchedAt,
    fetchedAtSlot: meta.fetchedAtSlot,
    raw: { protocol: "splash", pool },
  };
}

export function fromVyFinance(pool: VyFinancePool, meta: SnapshotMeta): PoolSnapshot {
  return {
    id: pool.poolId,
    protocol: "vyfinance",
    assets: [pool.assetA, pool.assetB],
    reserves: [pool.reserveA, pool.reserveB],
    nominalFeeBps: Number(pool.feeBasisPoints),
    ...applyDefaults("vyfinance", meta),
    fetchedAt: meta.fetchedAt,
    fetchedAtSlot: meta.fetchedAtSlot,
    raw: { protocol: "vyfinance", pool },
  };
}

export function fromMuesliSwap(pool: MuesliSwapPool, meta: SnapshotMeta): PoolSnapshot {
  const nominalFeeBps = Number(pool.feeNumerator) / Number(pool.feeDenominator) * 10000;
  return {
    id: pool.poolId,
    protocol: "muesliswap",
    assets: [pool.assetA, pool.assetB],
    reserves: [pool.reserveA, pool.reserveB],
    nominalFeeBps,
    ...applyDefaults("muesliswap", meta),
    fetchedAt: meta.fetchedAt,
    fetchedAtSlot: meta.fetchedAtSlot,
    raw: { protocol: "muesliswap", pool },
  };
}

/** In-memory registry of pool snapshots indexed for pair lookup. */
export class PoolRegistry {
  private byId = new Map<string, PoolSnapshot>();

  /** Insert or replace a snapshot (latest write wins on the same pool id). */
  upsert(snapshot: PoolSnapshot): void {
    this.byId.set(snapshot.id, snapshot);
  }

  upsertAll(snapshots: PoolSnapshot[]): void {
    for (const s of snapshots) this.upsert(s);
  }

  get(id: string): PoolSnapshot | undefined {
    return this.byId.get(id);
  }

  all(): PoolSnapshot[] {
    return [...this.byId.values()];
  }

  byProtocol(protocol: ProtocolId): PoolSnapshot[] {
    return this.all().filter((s) => s.protocol === protocol);
  }

  /** All snapshots that can quote the given unordered pair. */
  poolsForPair(assetX: string, assetY: string): PoolSnapshot[] {
    return this.all().filter((s) => snapshotSupportsPair(s, assetX, assetY));
  }

  size(): number {
    return this.byId.size;
  }
}
