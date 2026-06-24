// Benchmark runner — orchestration and fixture definition.
// Injects quote functions to stay testable offline and producible live.

import { buildScoreboardMarkdown, classifyCell, type BenchmarkCell, type ScoreboardMeta } from "./scoreboard";

// Canonical mainnet asset units for the benchmark basket (plan T1.10).
export const ADA = "lovelace";
export const SNEK = "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b";
export const USDM = "c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d";
export const IUSD = "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880069555344";
export const MIN = "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e";
export const WMT = "1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e776f726c646d6f62696c65746f6b656e";

/** Symbol labels for readable scoreboard rows. */
export const SYMBOLS: Record<string, string> = {
  [ADA]: "ADA", [SNEK]: "SNEK", [USDM]: "USDM", [IUSD]: "iUSD", [MIN]: "MIN", [WMT]: "WMT",
};

/** Fixed benchmark basket (plan T1.10): 5 ADA pairs + 2 non-ADA pairs. */
export const BENCHMARK_PAIRS = [
  { input: ADA, output: SNEK },
  { input: ADA, output: USDM },
  { input: ADA, output: IUSD },
  { input: ADA, output: MIN },
  { input: ADA, output: WMT },
  { input: USDM, output: IUSD }, // non-ADA: stable/stable
  { input: MIN, output: SNEK }, // non-ADA: token/token
];

export const BENCHMARK_SIZES_ADA = [100, 5000, 50000];

export type BenchmarkOpts = {
  ourQuote: (inputAssetId: string, outputAssetId: string, sizeAda: number) => number;
  adapterQuotes: (
    inputAssetId: string,
    outputAssetId: string,
    sizeAda: number
  ) => Record<string, number | null>;
  meta: ScoreboardMeta;
};

/**
 * Run the full benchmark: iterate over pair×size combinations, collect quotes,
 * classify verdicts, and return markdown-ready cells. Pure function — no I/O.
 */
export function runBenchmark(opts: BenchmarkOpts): BenchmarkCell[] {
  const cells: BenchmarkCell[] = [];

  for (const pair of BENCHMARK_PAIRS) {
    for (const sizeAda of BENCHMARK_SIZES_ADA) {
      const ourOutput = opts.ourQuote(pair.input, pair.output, sizeAda);
      const adapterOutputs = opts.adapterQuotes(pair.input, pair.output, sizeAda);

      // Find the best non-null adapter quote.
      let bestAdapter: number | null = null;
      for (const val of Object.values(adapterOutputs)) {
        if (val !== null && (bestAdapter === null || val > bestAdapter)) {
          bestAdapter = val;
        }
      }

      const verdict = classifyCell(ourOutput, bestAdapter);
      const label = (u: string) => SYMBOLS[u] ?? `${u.slice(0, 8)}…`;
      const pairStr = `${label(pair.input)}/${label(pair.output)}`;

      cells.push({
        pair: pairStr,
        sizeAda,
        ourOutput,
        adapterOutputs,
        bestAdapter,
        verdict,
      });
    }
  }

  return cells;
}

/**
 * Convenience wrapper: run benchmark and render markdown.
 */
export function runBenchmarkToMarkdown(opts: BenchmarkOpts): string {
  const cells = runBenchmark(opts);
  return buildScoreboardMarkdown(cells, opts.meta);
}
