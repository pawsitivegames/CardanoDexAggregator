// Unified pool registry (T1.6). The single normalized model every protocol decoder
// feeds into, and the one place the domain layer (quoteEngine, aggregator) reads pools
// from. Per-protocol decoded state is kept verbatim in `raw` so the uniform quote
// dispatch can call each protocol's exact math without lossy flattening.

import type { MinswapV2Pool } from "../minswapV2/types";
import { quoteExactIn as quoteMinswapV2 } from "../minswapV2/quote";
import type { MinswapStablePool } from "../minswapStable/types";
import {
  quoteExactInByAsset as quoteMinswapStable,
} from "../minswapStable/quote";
import type { SundaeSwapV3Pool } from "../sundaeswapV3/types";
import { quoteExactIn as quoteSundaeV3 } from "../sundaeswapV3/quote";
import type { WingRidersV2Pool } from "../wingRidersV2/types";
import { quoteExactIn as quoteWingRidersV2 } from "../wingRidersV2/quote";

/** How an order against this pool settles. Drives the settlement-aware ranking (Phase 2). */
export type SettlementClass = "batcher" | "direct";

export type ProtocolId =
  | "minswapV2"
  | "minswapStable"
  | "sundaeswapV3"
  | "wingRidersV2";

/** Protocol-specific decoded pool, tagged so the quote dispatch is exhaustive. */
export type RawPool =
  | { protocol: "minswapV2"; pool: MinswapV2Pool }
  | { protocol: "minswapStable"; pool: MinswapStablePool }
  | { protocol: "sundaeswapV3"; pool: SundaeSwapV3Pool }
  | { protocol: "wingRidersV2"; pool: WingRidersV2Pool };

/**
 * The normalized pool model (plan T1.6): id, protocol, assets, reserves, fee summary,
 * batcher fee, min-ADA, settlement class, and a staleness stamp. `raw` retains the
 * exact decoded state for precise quoting via {@link quoteSnapshotExactIn}.
 */
export type PoolSnapshot = {
  id: string;
  protocol: ProtocolId;
  /** Asset unit strings ("lovelace" or policyId+hexName). 2 for AMM, >=2 for stable. */
  assets: string[];
  /** Normalized reserves parallel to `assets`. For book venues this is omitted. */
  reserves: bigint[];
  /** Nominal fee in bps for display/heuristics only — exact fee is applied in `raw` math. */
  nominalFeeBps: number;
  /** Fixed batcher/scooper fee for one order against this venue, in lovelace. */
  batcherFeeLovelace: bigint;
  /** Min-ADA that must accompany the order UTxO, in lovelace. */
  minAdaLovelace: bigint;
  settlementClass: SettlementClass;
  /** ISO timestamp the snapshot was built (staleness gating in quoteEngine). */
  fetchedAt: string;
  /** Chain slot the underlying UTxO was observed at, when known. */
  fetchedAtSlot?: number;
  raw: RawPool;
};

/** Optional quoting context for protocols that need it (e.g. Sundae's slot-decay fee). */
export type QuoteContext = {
  currentSlot?: number;
};

/** True if the snapshot can quote the given (assetIn, assetOut) pair. */
export function snapshotSupportsPair(
  snapshot: PoolSnapshot,
  assetIn: string,
  assetOut: string,
): boolean {
  return (
    assetIn !== assetOut &&
    snapshot.assets.includes(assetIn) &&
    snapshot.assets.includes(assetOut)
  );
}

/**
 * Uniform exact-in quote across every protocol. Dispatches to the protocol's own
 * (spec-exact) math using the retained `raw` state. Returns amountOut in the output
 * asset's smallest units. Throws on unsupported asset / non-positive amount.
 */
export function quoteSnapshotExactIn(
  snapshot: PoolSnapshot,
  assetIn: string,
  assetOut: string,
  amountIn: bigint,
  ctx: QuoteContext = {},
): bigint {
  if (!snapshotSupportsPair(snapshot, assetIn, assetOut)) {
    throw new Error(
      `snapshot ${snapshot.id} does not support ${assetIn} -> ${assetOut}`,
    );
  }
  const raw = snapshot.raw;
  switch (raw.protocol) {
    case "minswapV2":
      return quoteMinswapV2(raw.pool, assetIn, amountIn);
    case "wingRidersV2":
      return quoteWingRidersV2(raw.pool, assetIn, amountIn);
    case "sundaeswapV3":
      return quoteSundaeV3(raw.pool, assetIn, amountIn, ctx.currentSlot);
    case "minswapStable":
      return quoteMinswapStable(raw.pool, assetIn, assetOut, amountIn);
    default: {
      // Exhaustiveness guard — adding a ProtocolId without a case is a compile error.
      const _never: never = raw;
      throw new Error(`unhandled protocol ${(_never as RawPool).protocol}`);
    }
  }
}
