import { describe, it, expect } from "vitest";
import { constantProductSwap, computeOptimalSplit, computeSwapPriceImpactPct } from "./amm";

describe("constantProductSwap", () => {
  it("returns zero output for zero input", () => {
    expect(constantProductSwap(0, 1000, 2000, 30)).toBe(0);
  });

  it("computes output correctly for a standard swap", () => {
    const reserveIn = 100_000;
    const reserveOut = 1_000_000;
    const input = 10_000;
    const feeBps = 30;
    const feeFactor = 1 - 30 / 10000;
    const expected = (input * feeFactor * reserveOut) / (reserveIn + input * feeFactor);
    expect(constantProductSwap(input, reserveIn, reserveOut, feeBps)).toBeCloseTo(expected, 10);
  });

  it("handles zero fee correctly", () => {
    const output = constantProductSwap(100, 1000, 2000, 0);
    expect(output).toBeCloseTo((100 * 2000) / (1000 + 100), 10);
  });

  it("produces diminishing returns with larger input", () => {
    const smallOutput = constantProductSwap(100, 1000, 2000, 30);
    const largeOutput = constantProductSwap(1000, 1000, 2000, 30);
    const smallRate = smallOutput / 100;
    const largeRate = largeOutput / 1000;
    expect(largeRate).toBeLessThan(smallRate);
  });

  it("output never exceeds reserveOut (k invariant)", () => {
    const output = constantProductSwap(1_000_000, 1000, 2000, 30);
    expect(output).toBeLessThan(2000);
  });
});

describe("computeSwapPriceImpactPct", () => {
  it("returns 0 for zero input", () => {
    expect(computeSwapPriceImpactPct(0, 1000)).toBe(0);
  });

  it("returns 0 for zero reserve", () => {
    expect(computeSwapPriceImpactPct(100, 0)).toBe(0);
  });

  it("returns correct impact for non-trivial swap", () => {
    const impact = computeSwapPriceImpactPct(100, 190);
    expect(impact).toBeCloseTo(34.48, 1);
  });
});

describe("computeOptimalSplit", () => {
  it("returns empty results for empty pools", () => {
    const result = computeOptimalSplit(1000, []);
    expect(result.allocations).toEqual([]);
    expect(result.outputs).toEqual([]);
    expect(result.totalOutput).toBe(0);
  });

  it("allocates all input to a single pool", () => {
    const result = computeOptimalSplit(1000, [
      { reserveIn: 100_000, reserveOut: 1_000_000, feeBps: 30 },
    ]);
    expect(result.allocations[0]).toBeCloseTo(1000, 1);
  });

  it("allocates more to the deeper pool when both have same price", () => {
    const deep = 1_000_000;
    const shallow = 100_000;
    const result = computeOptimalSplit(10_000, [
      { reserveIn: deep, reserveOut: deep * 10, feeBps: 30 },
      { reserveIn: shallow, reserveOut: shallow * 10, feeBps: 30 },
    ]);
    expect(result.allocations[0]).toBeGreaterThan(result.allocations[1]);
  });

  it("total output from split is at least as good as all-to-one-pool", () => {
    const pools = [
      { reserveIn: 100_000, reserveOut: 500_000, feeBps: 30 },
      { reserveIn: 50_000, reserveOut: 250_000, feeBps: 30 },
    ];
    const split = computeOptimalSplit(10_000, pools);

    const single0 = constantProductSwap(10_000, pools[0].reserveIn, pools[0].reserveOut, pools[0].feeBps);
    const single1 = constantProductSwap(10_000, pools[1].reserveIn, pools[1].reserveOut, pools[1].feeBps);

    expect(split.totalOutput).toBeGreaterThanOrEqual(Math.min(single0, single1));
  });

  it("handles pools with different fees", () => {
    const pools = [
      { reserveIn: 100_000, reserveOut: 1_000_000, feeBps: 10 },
      { reserveIn: 100_000, reserveOut: 1_000_000, feeBps: 100 },
    ];
    const result = computeOptimalSplit(10_000, pools);
    const totalAllocated = result.allocations.reduce((s, a) => s + a, 0);
    expect(totalAllocated).toBeCloseTo(10_000, 1);
  });
});
