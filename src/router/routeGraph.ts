// Route graph construction (T1.9). Tokens are nodes, pool snapshots are edges. We build
// the set of independently-fillable RouteLegs for a pair: every direct pool, plus every
// 2-hop path through a connector token (ADA + top connectors USDM/iUSD/SNEK per plan).
// Legs feed routeSplit(), which allocates the trade across them.

import {
  quoteSnapshotExactIn,
  snapshotSupportsPair,
  type PoolSnapshot,
  type QuoteContext,
} from "../protocols/registry/poolSnapshot";
import type { PoolRegistry } from "../protocols/registry/registry";
import { LOVELACE_ASSET_ID } from "../domain/assets";
import type { RouteLeg } from "./types";

/** Default connector tokens for 2-hop routing (plan T1.9): ADA + top liquidity hubs. */
export const DEFAULT_CONNECTORS = [
  LOVELACE_ASSET_ID,
  "c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d", // USDM
  "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880069555344", // iUSD
  "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b", // SNEK
];

export type BuildLegsOptions = {
  connectors?: string[];
  /** Max hops per leg (1 = direct only, 2 = direct + one connector). Default 2. */
  maxHops?: number;
  ctx?: QuoteContext;
};

const legFixedCost = (snap: PoolSnapshot): bigint => snap.batcherFeeLovelace + snap.minAdaLovelace;

function directLeg(snap: PoolSnapshot, assetIn: string, assetOut: string, ctx: QuoteContext): RouteLeg {
  return {
    id: snap.id,
    assetIn,
    assetOut,
    hops: [{ snapshot: snap, assetIn, assetOut }],
    quote: (amountIn: bigint) =>
      amountIn <= 0n ? 0n : quoteSnapshotExactIn(snap, assetIn, assetOut, amountIn, ctx),
    fixedCostLovelace: legFixedCost(snap),
  };
}

function twoHopLeg(
  first: PoolSnapshot,
  second: PoolSnapshot,
  assetIn: string,
  mid: string,
  assetOut: string,
  ctx: QuoteContext,
): RouteLeg {
  return {
    id: `${first.id}>${second.id}`,
    assetIn,
    assetOut,
    hops: [
      { snapshot: first, assetIn, assetOut: mid },
      { snapshot: second, assetIn: mid, assetOut },
    ],
    quote: (amountIn: bigint) => {
      if (amountIn <= 0n) return 0n;
      const midAmount = quoteSnapshotExactIn(first, assetIn, mid, amountIn, ctx);
      if (midAmount <= 0n) return 0n;
      return quoteSnapshotExactIn(second, mid, assetOut, midAmount, ctx);
    },
    fixedCostLovelace: legFixedCost(first) + legFixedCost(second),
  };
}

/**
 * Build all RouteLegs for (assetIn -> assetOut) from the registry: direct pools and, when
 * maxHops >= 2, 2-hop paths through each connector. Connectors equal to the input or
 * output asset are skipped (those are already direct). De-dupes leg ids.
 */
export function buildLegs(
  registry: PoolRegistry,
  assetIn: string,
  assetOut: string,
  opts: BuildLegsOptions = {},
): RouteLeg[] {
  const connectors = opts.connectors ?? DEFAULT_CONNECTORS;
  const maxHops = opts.maxHops ?? 2;
  const ctx = opts.ctx ?? {};
  const legs: RouteLeg[] = [];
  const seen = new Set<string>();

  const push = (leg: RouteLeg) => {
    if (!seen.has(leg.id)) {
      seen.add(leg.id);
      legs.push(leg);
    }
  };

  for (const snap of registry.poolsForPair(assetIn, assetOut)) {
    push(directLeg(snap, assetIn, assetOut, ctx));
  }

  if (maxHops >= 2) {
    for (const mid of connectors) {
      if (mid === assetIn || mid === assetOut) continue;
      const firstHops = registry.poolsForPair(assetIn, mid);
      const secondHops = registry.poolsForPair(mid, assetOut);
      if (firstHops.length === 0 || secondHops.length === 0) continue;
      for (const first of firstHops) {
        if (!snapshotSupportsPair(first, assetIn, mid)) continue;
        for (const second of secondHops) {
          if (second.id === first.id) continue; // a single pool can't be both hops
          if (!snapshotSupportsPair(second, mid, assetOut)) continue;
          push(twoHopLeg(first, second, assetIn, mid, assetOut, ctx));
        }
      }
    }
  }

  return legs;
}
