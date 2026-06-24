import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { buildScoreboardMarkdown, classifyCell, type BenchmarkCell } from "./scoreboard";
import { BENCHMARK_PAIRS, BENCHMARK_SIZES_ADA, SYMBOLS } from "./runner";
import type { QuoteRequest } from "../domain/routes";
import type { QuoteAdapterResult, QuoteAdapterSuccess } from "../adapters/types";

type LiveAdapter = {
  id: string;
  displayName: string;
  getQuotes: (request: QuoteRequest, now?: Date) => Promise<QuoteAdapterResult[]> | QuoteAdapterResult[];
};

type AdapterSet = {
  owned: LiveAdapter[];
  competitors: Record<string, LiveAdapter>;
  aggregateOwned: (
    request: QuoteRequest,
    adapterResults: QuoteAdapterResult[],
    now: Date,
  ) => QuoteAdapterResult | null;
};

type CellNote = {
  pair: string;
  sizeAda: number;
  source: string;
  message: string;
};

loadDotEnv();

async function loadAdapters(): Promise<AdapterSet> {
  const [
    minswapPool,
    minswapDiscoveredPool,
    wingRidersPool,
    sundaePool,
    minswap,
    dexHunter,
    steelswap,
    cardexscan,
    saturn,
    aggregator,
  ] = await Promise.all([
    import("../adapters/minswapV2DirectPoolAdapter"),
    import("../adapters/minswapDiscoveredPoolAdapter"),
    import("../adapters/wingRidersDirectPoolAdapter"),
    import("../adapters/sundaeSwapV3DirectPoolAdapter"),
    import("../adapters/minswapLiveAdapter"),
    import("../adapters/dexHunterLiveAdapter"),
    import("../adapters/steelswapLiveAdapter"),
    import("../adapters/cardexscanLiveAdapter"),
    import("../adapters/saturnSwapLiveAdapter"),
    import("../adapters/aggregatorAdapter"),
  ]);

  return {
    owned: [
      minswapPool.minswapV2DirectPoolAdapter,
      minswapDiscoveredPool.minswapDiscoveredPoolAdapter,
      wingRidersPool.wingRidersV2DirectPoolAdapter,
      sundaePool.sundaeSwapV3DirectPoolAdapter,
    ],
    competitors: {
      minswap: minswap.minswapLiveReadOnlyAdapter,
      dexhunter: dexHunter.dexHunterReadOnlyAdapter,
      steelswap: steelswap.steelswapReadOnlyAdapter,
      cardexscan: cardexscan.cardexscanReadOnlyAdapter,
      saturnswap: saturn.saturnSwapReadOnlyAdapter,
    },
    aggregateOwned: aggregator.computeClearRouteAggregation,
  };
}

async function main() {
  const adapters = await loadAdapters();
  const cells: BenchmarkCell[] = [];
  const notes: CellNote[] = [];
  const now = new Date();

  for (const pair of BENCHMARK_PAIRS) {
    for (const sizeAda of BENCHMARK_SIZES_ADA) {
      const request: QuoteRequest = {
        inputAssetId: pair.input,
        outputAssetId: pair.output,
        amountIn: sizeAda,
        slippageTolerancePct: 0.5,
        network: "mainnet",
      };
      const pairLabel = labelPair(pair.input, pair.output);

      const ownedResults = await quoteAdapters(adapters.owned, request, now, notes, pairLabel, sizeAda);
      const ownedSuccesses = ownedResults.filter((r): r is QuoteAdapterSuccess => r.ok);
      const aggregated = adapters.aggregateOwned(request, ownedResults, now);
      const aggregatedOutput = aggregated?.ok ? aggregated.grossOutput : null;
      const bestOwned = bestSuccessOutput(ownedSuccesses);
      const ourOutput = aggregatedOutput ?? bestOwned ?? 0;

      if (ourOutput === 0) {
        notes.push({
          pair: pairLabel,
          sizeAda,
          source: "our-router",
          message: "No owned live pool quote was available for this benchmark cell.",
        });
      }

      const adapterOutputs: Record<string, number | null> = {};
      for (const [name, adapter] of Object.entries(adapters.competitors)) {
        const results = await quoteAdapters([adapter], request, now, notes, pairLabel, sizeAda);
        adapterOutputs[name] = bestSuccessOutput(results.filter((r): r is QuoteAdapterSuccess => r.ok));
      }

      const bestAdapter = bestNumeric(Object.values(adapterOutputs));
      cells.push({
        pair: pairLabel,
        sizeAda,
        ourOutput,
        adapterOutputs,
        bestAdapter,
        verdict: classifyCell(ourOutput, bestAdapter),
      });
    }
  }

  const markdown =
    buildScoreboardMarkdown(cells, {
      generatedAt: now.toISOString(),
      mode: "live",
    }) + renderNotes(notes);

  const docDir = join(process.cwd(), "docs", "benchmarks");
  if (!existsSync(docDir)) mkdirSync(docDir, { recursive: true });
  const filePath = join(docDir, "scoreboard-live.md");
  writeFileSync(filePath, markdown, "utf-8");

  console.log(`Live scoreboard written to ${filePath}`);
  console.log("\nFirst 40 lines:");
  console.log(markdown.split("\n").slice(0, 40).join("\n"));
}

function loadDotEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function quoteAdapters(
  adapters: LiveAdapter[],
  request: QuoteRequest,
  now: Date,
  notes: CellNote[],
  pair: string,
  sizeAda: number,
): Promise<QuoteAdapterResult[]> {
  const all: QuoteAdapterResult[] = [];
  for (const adapter of adapters) {
    try {
      const results = await adapter.getQuotes(request, now);
      all.push(...results);
      for (const result of results) {
        if (!result.ok && result.reason !== "unsupported_pair") {
          notes.push({ pair, sizeAda, source: adapter.id, message: result.message });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown adapter error.";
      notes.push({ pair, sizeAda, source: adapter.id, message });
    }
  }
  return all;
}

function bestSuccessOutput(successes: QuoteAdapterSuccess[]): number | null {
  return bestNumeric(successes.map((s) => s.grossOutput));
}

function bestNumeric(values: Array<number | null>): number | null {
  let best: number | null = null;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && (best === null || value > best)) {
      best = value;
    }
  }
  return best;
}

function labelPair(input: string, output: string): string {
  const label = (unit: string) => SYMBOLS[unit] ?? `${unit.slice(0, 8)}...`;
  return `${label(input)}/${label(output)}`;
}

function renderNotes(notes: CellNote[]): string {
  if (notes.length === 0) return "";

  const lines = ["", "## Live Coverage Notes", ""];
  for (const note of notes) {
    lines.push(`- **${note.pair} ${note.sizeAda} ADA / ${note.source}:** ${note.message}`);
  }
  lines.push("");
  return lines.join("\n");
}

main().catch((err) => {
  console.error("Failed to generate live scoreboard:", err);
  process.exit(1);
});
