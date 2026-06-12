import { describe, it, expect } from "vitest";
import { routeSplit } from "./splitRouter";
import type { RouteLeg } from "./types";

const ADA = "lovelace";
const TOKEN = "tokenX";

// Synthetic constant-product leg (concave, monotone) for property testing.
function cpLeg(
  id: string,
  reserveIn: bigint,
  reserveOut: bigint,
  fixedCostLovelace: bigint,
  assetIn = ADA,
  assetOut = TOKEN,
): RouteLeg {
  return {
    id,
    assetIn,
    assetOut,
    hops: [],
    quote: (amountIn: bigint) =>
      amountIn <= 0n ? 0n : (amountIn * reserveOut) / (reserveIn + amountIn),
    fixedCostLovelace,
  };
}

function sumIn(allocations: { amountIn: bigint }[]): bigint {
  return allocations.reduce((a, b) => a + b.amountIn, 0n);
}

describe("routeSplit — marginal-output equalization", () => {
  it("allocations always sum exactly to the input amount", () => {
    const legs = [
      cpLeg("a", 1_000_000_000n, 1_000_000_000n, 4_000_000n),
      cpLeg("b", 2_000_000_000n, 2_000_000_000n, 4_000_000n),
      cpLeg("c", 500_000_000n, 500_000_000n, 4_000_000n),
    ];
    for (const input of [1_000_000n, 100_000_000n, 1_000_000_000n, 5_000_000_000n]) {
      const r = routeSplit(legs, input);
      expect(sumIn(r.allocations)).toBe(input);
    }
  });

  it("net output >= best single leg output minus its fixed cost (output is ADA path)", () => {
    // assetOut = ADA so fixed costs are in output units directly.
    const legs = [
      cpLeg("a", 1_000_000_000n, 1_200_000_000n, 4_000_000n, TOKEN, ADA),
      cpLeg("b", 3_000_000_000n, 3_500_000_000n, 4_000_000n, TOKEN, ADA),
    ];
    const input = 800_000_000n;
    const r = routeSplit(legs, input);
    const bestSolo = legs.map((l) => l.quote(input) - l.fixedCostLovelace).reduce((a, b) => (a > b ? a : b));
    expect(r.netOutput).toBeGreaterThanOrEqual(bestSolo);
  });

  it("gross output is monotonic non-decreasing in input size", () => {
    const legs = [
      cpLeg("a", 1_000_000_000n, 1_000_000_000n, 2_000_000n),
      cpLeg("b", 4_000_000_000n, 4_000_000_000n, 2_000_000n),
    ];
    let prev = -1n;
    for (const input of [10_000_000n, 50_000_000n, 200_000_000n, 1_000_000_000n, 4_000_000_000n]) {
      const g = routeSplit(legs, input).grossOutput;
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
  });

  it("splits across venues when it beats any single venue (deep + symmetric pools)", () => {
    const legs = [
      cpLeg("a", 1_000_000_000n, 1_000_000_000n, 0n, TOKEN, ADA),
      cpLeg("b", 1_000_000_000n, 1_000_000_000n, 0n, TOKEN, ADA),
    ];
    const input = 400_000_000n; // large vs reserves => price impact makes splitting win
    const r = routeSplit(legs, input);
    expect(r.allocations.length).toBe(2);
    const soloBest = legs[0].quote(input);
    expect(r.grossOutput).toBeGreaterThan(soloBest);
  });

  it("does NOT open a second venue when its fixed cost exceeds the marginal gain", () => {
    // Tiny trade on deep pools: price impact ~nil, so a 2nd order's batcher fee isn't worth it.
    const legs = [
      cpLeg("a", 10_000_000_000_000n, 10_000_000_000_000n, 5_000_000n, TOKEN, ADA),
      cpLeg("b", 10_000_000_000_000n, 10_000_000_000_000n, 5_000_000n, TOKEN, ADA),
    ];
    const r = routeSplit(legs, 1_000_000n);
    expect(r.allocations.length).toBe(1);
    expect(r.totalFixedCostLovelace).toBe(5_000_000n);
  });

  it("adding a strictly-worse (illiquid) leg never reduces net output", () => {
    const good = cpLeg("good", 5_000_000_000n, 5_000_000_000n, 2_000_000n, TOKEN, ADA);
    const bad = cpLeg("bad", 1_000n, 1_000n, 2_000_000n, TOKEN, ADA);
    const input = 300_000_000n;
    const withoutBad = routeSplit([good], input).netOutput;
    const withBad = routeSplit([good, bad], input).netOutput;
    expect(withBad).toBeGreaterThanOrEqual(withoutBad);
  });

  it("returns empty result for no legs or non-positive input", () => {
    expect(routeSplit([], 100n).allocations).toEqual([]);
    expect(routeSplit([cpLeg("a", 1n, 1n, 0n)], 0n).allocations).toEqual([]);
  });

  it("flags costsConverted=false for non-ADA pairs (no price anchor)", () => {
    const legs = [cpLeg("a", 1_000_000n, 1_000_000n, 4_000_000n, "tokenA", "tokenB")];
    const r = routeSplit(legs, 100_000n);
    expect(r.costsConverted).toBe(false);
    expect(r.netOutput).toBe(r.grossOutput);
  });
});
