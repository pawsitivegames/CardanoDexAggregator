import { describe, it, expect } from "vitest";
import {
  classifyCell,
  buildScoreboardMarkdown,
  type BenchmarkCell,
  type ScoreboardMeta,
} from "./scoreboard";
import { runBenchmark } from "./runner";

describe("classifyCell", () => {
  it("returns 'win' when our >= best", () => {
    expect(classifyCell(100, 80)).toBe("win");
    expect(classifyCell(100, 100)).toBe("win");
  });

  it("returns 'within_0.3pct' when within 0.3% of best", () => {
    const best = 1000;
    const threshold = best * (1 - 0.003); // 997

    expect(classifyCell(998, best)).toBe("within_0.3pct");
    expect(classifyCell(threshold, best)).toBe("within_0.3pct");
  });

  it("returns 'loss' when below 0.3% threshold", () => {
    const best = 1000;
    const threshold = best * (1 - 0.003); // 997
    expect(classifyCell(threshold - 1, best)).toBe("loss");
    expect(classifyCell(500, best)).toBe("loss");
  });

  it("returns 'win' when best is null", () => {
    expect(classifyCell(100, null)).toBe("win");
  });
});

describe("buildScoreboardMarkdown", () => {
  it("renders a table with headers and one row per cell", () => {
    const cells: BenchmarkCell[] = [
      {
        pair: "ADA/SNEK",
        sizeAda: 100,
        ourOutput: 50.123456,
        adapterOutputs: {
          aggregator: 49.0,
          cardexscan: 48.5,
          steelswap: null,
          saturnswap: 51.0,
        },
        bestAdapter: 51.0,
        verdict: "within_0.3pct",
      },
    ];

    const meta: ScoreboardMeta = {
      generatedAt: "2024-01-01T00:00:00Z",
      mode: "offline-fixture",
    };

    const markdown = buildScoreboardMarkdown(cells, meta);

    expect(markdown).toContain("# Benchmark Scoreboard");
    expect(markdown).toContain("2024-01-01T00:00:00Z");
    expect(markdown).toContain("Offline Fixture");
    expect(markdown).toContain("ADA/SNEK");
    expect(markdown).toContain("50.123456");
    expect(markdown).toContain("51.000000");
    expect(markdown).toContain("within_0.3pct");
    expect(markdown).toContain("N/A"); // steelswap null
    expect(markdown).toContain("Gate 1");
  });

  it("includes Gate 1 PASS when >= 60% wins", () => {
    const cells: BenchmarkCell[] = [
      {
        pair: "A/B",
        sizeAda: 100,
        ourOutput: 100,
        adapterOutputs: { adapter: 90 },
        bestAdapter: 90,
        verdict: "win",
      },
      {
        pair: "C/D",
        sizeAda: 100,
        ourOutput: 80,
        adapterOutputs: { adapter: 100 },
        bestAdapter: 100,
        verdict: "within_0.3pct", // 100 * 0.997 = 99.7, so >= 99.7 counts
      },
      {
        pair: "E/F",
        sizeAda: 100,
        ourOutput: 95,
        adapterOutputs: { adapter: 100 },
        bestAdapter: 100,
        verdict: "loss",
      },
    ];

    const meta: ScoreboardMeta = {
      generatedAt: "2024-01-01T00:00:00Z",
      mode: "live",
    };

    const markdown = buildScoreboardMarkdown(cells, meta);

    // 1 win out of 3 = 33% win, < 60%, so FAIL
    expect(markdown).toContain("FAIL");
  });

  it("includes Gate 1 PASS when exactly 60% wins", () => {
    const cells: BenchmarkCell[] = [
      {
        pair: "A/B",
        sizeAda: 100,
        ourOutput: 100,
        adapterOutputs: { adapter: 90 },
        bestAdapter: 90,
        verdict: "win",
      },
      {
        pair: "C/D",
        sizeAda: 100,
        ourOutput: 100,
        adapterOutputs: { adapter: 90 },
        bestAdapter: 90,
        verdict: "win",
      },
      {
        pair: "E/F",
        sizeAda: 100,
        ourOutput: 80,
        adapterOutputs: { adapter: 100 },
        bestAdapter: 100,
        verdict: "loss",
      },
    ];

    const meta: ScoreboardMeta = {
      generatedAt: "2024-01-01T00:00:00Z",
      mode: "live",
    };

    const markdown = buildScoreboardMarkdown(cells, meta);

    // 2 wins out of 3 = 66% win, >= 60%, so PASS
    expect(markdown).toContain("PASS");
  });

  it("includes summary stats", () => {
    const cells: BenchmarkCell[] = [
      {
        pair: "A/B",
        sizeAda: 100,
        ourOutput: 100,
        adapterOutputs: { adapter: 90 },
        bestAdapter: 90,
        verdict: "win",
      },
      {
        pair: "C/D",
        sizeAda: 100,
        ourOutput: 100,
        adapterOutputs: { adapter: 90 },
        bestAdapter: 90,
        verdict: "win",
      },
      {
        pair: "E/F",
        sizeAda: 100,
        ourOutput: 99,
        adapterOutputs: { adapter: 100 },
        bestAdapter: 100,
        verdict: "within_0.3pct",
      },
    ];

    const meta: ScoreboardMeta = {
      generatedAt: "2024-01-01T00:00:00Z",
      mode: "live",
    };

    const markdown = buildScoreboardMarkdown(cells, meta);

    expect(markdown).toContain("Cells Evaluated");
    expect(markdown).toContain("Wins");
    expect(markdown).toContain("Within 0.3%");
  });
});

describe("runBenchmark", () => {
  it("runs with injected quote functions and returns cells with verdicts", () => {
    const mockOurQuote = (input: string, output: string, size: number) => {
      // Simple mock: returns size * 2 for all pairs
      return size * 2;
    };

    const mockAdapterQuotes = (input: string, output: string, size: number) => ({
      aggregator: size * 1.5,
      cardexscan: size * 1.8,
      steelswap: null,
      saturnswap: size * 2.2,
    });

    const meta: ScoreboardMeta = {
      generatedAt: "2024-01-01T00:00:00Z",
      mode: "offline-fixture",
    };

    const cells = runBenchmark({
      ourQuote: mockOurQuote,
      adapterQuotes: mockAdapterQuotes,
      meta,
    });

    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBe(7 * 3); // 7 basket pairs * 3 sizes

    // Check that each cell has required fields
    for (const cell of cells) {
      expect(cell.pair).toBeDefined();
      expect(cell.sizeAda).toBeDefined();
      expect(cell.ourOutput).toBeDefined();
      expect(cell.adapterOutputs).toBeDefined();
      expect(cell.verdict).toMatch(/^(win|within_0.3pct|loss)$/);
    }

    // Our quote is size*2, best adapter is size*2.2, so we should lose
    const firstCell = cells[0];
    expect(firstCell.bestAdapter).toBe(100 * 2.2); // size=100, saturnswap=2.2x
    expect(firstCell.ourOutput).toBe(100 * 2);
    expect(firstCell.verdict).toBe("loss"); // 200 < 220 * 0.997
  });
});
