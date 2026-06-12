// Marginal-output-equalization splitter (T1.9, Opus-designed allocation core).
//
// Objective: maximize net output = Σ leg.quote(allocᵢ) − Σ fixedCost(used legs), where
// fixed costs are converted from lovelace into output units at the realized rate. Because
// every leg's quote is monotone and concave (constant-product, stableswap, and their
// compositions all are), two facts hold and we exploit both:
//   1. Within a fixed set of legs, marginal-output equalization (greedy step allocation to
//      the highest current marginal) converges to the gross-optimal split.
//   2. Adding legs has diminishing returns, so greedy leg-opening in descending solo-output
//      order — stop as soon as one candidate fails to improve net — is near-optimal and,
//      with exact fixed costs, prunes splits precisely (plan T1.9).

import { LOVELACE_ASSET_ID as LOVELACE } from "../domain/assets";
import type { LegAllocation, RouteLeg, SplitResult } from "./types";

const DEFAULT_STEPS = 1000;

/** Gross-optimal allocation of `totalInput` across a fixed `legs` set (ignores fixed costs). */
function marginalSplit(
  legs: RouteLeg[],
  totalInput: bigint,
  steps: number,
): { allocations: bigint[]; outputs: bigint[]; gross: bigint } {
  const n = legs.length;
  const alloc = new Array<bigint>(n).fill(0n);
  if (n === 0 || totalInput <= 0n) {
    return { allocations: alloc, outputs: new Array(n).fill(0n), gross: 0n };
  }
  if (n === 1) {
    const out = legs[0].quote(totalInput);
    return { allocations: [totalInput], outputs: [out], gross: out };
  }

  const step = totalInput / BigInt(steps);
  if (step <= 0n) {
    // Input smaller than the step granularity — give it all to the best solo leg.
    let bestIdx = 0;
    let bestOut = -1n;
    for (let i = 0; i < n; i++) {
      const o = legs[i].quote(totalInput);
      if (o > bestOut) { bestOut = o; bestIdx = i; }
    }
    alloc[bestIdx] = totalInput;
    const outputs = legs.map((l, i) => (i === bestIdx ? bestOut : 0n));
    return { allocations: alloc, outputs, gross: bestOut };
  }

  // Current output cached per leg so each step costs one extra quote per leg, not two.
  const curOut = legs.map((l) => l.quote(0n));
  let assigned = 0n;
  const stepsToRun = Number(totalInput / step);
  for (let s = 0; s < stepsToRun; s++) {
    let bestIdx = 0;
    let bestMarginal = -1n;
    for (let i = 0; i < n; i++) {
      const marginal = legs[i].quote(alloc[i] + step) - curOut[i];
      if (marginal > bestMarginal) { bestMarginal = marginal; bestIdx = i; }
    }
    alloc[bestIdx] += step;
    curOut[bestIdx] = legs[bestIdx].quote(alloc[bestIdx]);
    assigned += step;
  }
  // Assign any rounding remainder to the leg with the best current marginal.
  const remainder = totalInput - assigned;
  if (remainder > 0n) {
    let bestIdx = 0;
    let bestMarginal = -1n;
    for (let i = 0; i < n; i++) {
      const marginal = legs[i].quote(alloc[i] + remainder) - curOut[i];
      if (marginal > bestMarginal) { bestMarginal = marginal; bestIdx = i; }
    }
    alloc[bestIdx] += remainder;
    curOut[bestIdx] = legs[bestIdx].quote(alloc[bestIdx]);
  }

  const outputs = legs.map((l, i) => l.quote(alloc[i]));
  const gross = outputs.reduce((a, b) => a + b, 0n);
  return { allocations: alloc, outputs, gross };
}

/**
 * Convert a lovelace fixed cost into output-asset units at the realized rate of a split.
 * - output is ADA            → cost already in output units (factor 1).
 * - input is ADA             → outputPerLovelace = grossOutput / totalInput.
 * - neither side is ADA      → no anchor; return null (caller leaves netOutput == gross).
 */
function fixedCostToOutputUnits(
  costLovelace: bigint,
  assetIn: string,
  assetOut: string,
  totalInput: bigint,
  grossOutput: bigint,
): bigint | null {
  if (assetOut === LOVELACE) return costLovelace;
  if (assetIn === LOVELACE && totalInput > 0n) {
    return (costLovelace * grossOutput) / totalInput;
  }
  return null;
}

export type SplitOptions = { steps?: number };

/**
 * Choose the cost-optimal subset of legs and the allocation across them.
 * Greedy leg-opening in descending solo-output order; a leg is kept only if it improves
 * net output (gross minus fixed costs in output units). Returns the best split found.
 */
export function routeSplit(
  legs: RouteLeg[],
  totalInput: bigint,
  opts: SplitOptions = {},
): SplitResult {
  const steps = opts.steps ?? DEFAULT_STEPS;
  if (legs.length === 0 || totalInput <= 0n) {
    return {
      allocations: [],
      grossOutput: 0n,
      totalFixedCostLovelace: 0n,
      netOutput: 0n,
      costsConverted: false,
    };
  }

  const { assetIn, assetOut } = legs[0];

  // Net objective for a candidate leg set.
  const evaluate = (set: RouteLeg[]): { split: ReturnType<typeof marginalSplit>; net: bigint; fixed: bigint; converted: boolean } => {
    const split = marginalSplit(set, totalInput, steps);
    let fixed = 0n;
    for (let i = 0; i < set.length; i++) {
      if (split.allocations[i] > 0n) fixed += set[i].fixedCostLovelace;
    }
    const fixedOut = fixedCostToOutputUnits(fixed, assetIn, assetOut, totalInput, split.gross);
    const converted = fixedOut !== null;
    const net = split.gross - (fixedOut ?? 0n);
    return { split, net, fixed, converted };
  };

  // Order candidates by solo output (best first) for greedy opening.
  const ranked = [...legs].sort((a, b) => {
    const oa = a.quote(totalInput);
    const ob = b.quote(totalInput);
    return oa < ob ? 1 : oa > ob ? -1 : 0;
  });

  let active: RouteLeg[] = [ranked[0]];
  let best = evaluate(active);

  for (let k = 1; k < ranked.length; k++) {
    const trial = [...active, ranked[k]];
    const trialEval = evaluate(trial);
    if (trialEval.net > best.net) {
      active = trial;
      best = trialEval;
    } else {
      break; // diminishing returns — further legs won't help under concavity.
    }
  }

  const allocations: LegAllocation[] = active
    .map((leg, i) => ({ leg, amountIn: best.split.allocations[i], amountOut: best.split.outputs[i] }))
    .filter((a) => a.amountIn > 0n);

  return {
    allocations,
    grossOutput: best.split.gross,
    totalFixedCostLovelace: best.fixed,
    netOutput: best.net,
    costsConverted: best.converted,
  };
}
