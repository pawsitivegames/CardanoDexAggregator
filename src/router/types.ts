// Cross-protocol router types (T1.9). A RouteLeg is one independently-fillable path from
// the input asset to the output asset — either a single pool or a 2-hop chain through a
// connector token. Each leg carries its own (monotone, concave) exact-in quote function
// and the fixed on-chain cost of opening one order along it (Σ batcher fee + min-ADA per
// hop). The splitter allocates the trade across legs by marginal-output equalization.

import type { PoolSnapshot } from "../protocols/registry/poolSnapshot";

export type RouteHopRef = {
  snapshot: PoolSnapshot;
  assetIn: string;
  assetOut: string;
};

export type RouteLeg = {
  /** Stable id, e.g. "msv2-ada-min" or "ssv3-ada-usdm>wr2-usdm-snek". */
  id: string;
  assetIn: string;
  assetOut: string;
  hops: RouteHopRef[];
  /** Exact-in output for an input amount routed through every hop in order. */
  quote: (amountIn: bigint) => bigint;
  /** Σ (batcher fee + min-ADA) across hops, in lovelace — the cost of opening this leg. */
  fixedCostLovelace: bigint;
};

export type LegAllocation = {
  leg: RouteLeg;
  amountIn: bigint;
  amountOut: bigint;
};

export type SplitResult = {
  allocations: LegAllocation[];
  /** Σ amountOut across allocated legs (gross of fixed costs). */
  grossOutput: bigint;
  /** Σ fixedCostLovelace of allocated legs. */
  totalFixedCostLovelace: bigint;
  /**
   * Gross output minus fixed costs expressed in OUTPUT units (cost converted at the
   * realized rate). This is the objective the splitter maximizes. May equal grossOutput
   * when costs could not be converted (non-ADA pair without a price anchor — flagged).
   */
  netOutput: bigint;
  /** True when fixed costs were converted to output units; false => netOutput == grossOutput. */
  costsConverted: boolean;
};
