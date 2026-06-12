export type PoolState = {
  reserveIn: number;
  reserveOut: number;
  feeBps: number;
};

export function constantProductSwap(
  input: number,
  reserveIn: number,
  reserveOut: number,
  feeBps: number,
): number {
  const feeFactor = Math.max(0, 1 - feeBps / 10000);
  const effectiveInput = input * feeFactor;
  if (effectiveInput <= 0) return 0;
  return (effectiveInput * reserveOut) / (reserveIn + effectiveInput);
}

export function computeSwapPriceImpactPct(
  input: number,
  reserveIn: number,
): number {
  if (input <= 0 || reserveIn <= 0) return 0;
  return (input / (reserveIn + input)) * 100;
}

export function constantProductSpotPrice(
  reserveOut: number,
  reserveIn: number,
): number {
  if (reserveIn <= 0) return 0;
  return reserveOut / reserveIn;
}

function marginalOutput(
  input: number,
  reserveIn: number,
  reserveOut: number,
  feeBps: number,
): number {
  const feeFactor = Math.max(0, 1 - feeBps / 10000);
  const denominator = reserveIn + input * feeFactor;
  return (feeFactor * feeFactor * reserveOut * reserveIn) / (denominator * denominator);
}

export function computeOptimalSplit(
  totalInput: number,
  pools: PoolState[],
): { allocations: number[]; outputs: number[]; totalOutput: number } {
  if (pools.length === 0) {
    return { allocations: [], outputs: [], totalOutput: 0 };
  }
  if (pools.length === 1) {
    const output = constantProductSwap(totalInput, pools[0].reserveIn, pools[0].reserveOut, pools[0].feeBps);
    return { allocations: [totalInput], outputs: [output], totalOutput: output };
  }

  const n = pools.length;
  const allocations = new Array(n).fill(0);
  const steps = Math.max(200, Math.min(2000, Math.round(totalInput)));
  const step = totalInput / steps;
  let remaining = totalInput;

  for (let s = 0; s < steps; s++) {
    let bestIdx = 0;
    let bestMarginal = -Infinity;

    for (let i = 0; i < n; i++) {
      const m = marginalOutput(allocations[i], pools[i].reserveIn, pools[i].reserveOut, pools[i].feeBps);
      if (m > bestMarginal) {
        bestMarginal = m;
        bestIdx = i;
      }
    }

    allocations[bestIdx] += step;
    remaining -= step;
    if (remaining < 0.000001) break;
  }

  const totalAllocated = allocations.reduce((s, a) => s + a, 0);
  const scale = totalAllocated > 0 ? totalInput / totalAllocated : 1;
  for (let i = 0; i < n; i++) allocations[i] *= scale;

  const outputs = pools.map((p, i) =>
    constantProductSwap(allocations[i], p.reserveIn, p.reserveOut, p.feeBps),
  );
  const totalOutput = outputs.reduce((s, o) => s + o, 0);

  return { allocations, outputs, totalOutput };
}
