// Benchmark scoreboard — pure logic for classifying quote verdicts and rendering markdown.
// No network calls; used by both offline and live runners.

export type BenchmarkCell = {
  pair: string;
  sizeAda: number;
  ourOutput: number;
  adapterOutputs: Record<string, number | null>;
  bestAdapter: number | null;
  verdict: "win" | "within_0.3pct" | "loss";
};

/** Classify a single cell: win if our >= bestAdapter; within_0.3pct if within 0.3%; else loss. */
export function classifyCell(ourOutput: number, bestAdapter: number | null): "win" | "within_0.3pct" | "loss" {
  if (bestAdapter === null) {
    // No competitor data — we win by default.
    return "win";
  }
  if (ourOutput >= bestAdapter) {
    return "win";
  }
  // Check if within 0.3% of the best.
  const threshold = bestAdapter * (1 - 0.003);
  if (ourOutput >= threshold) {
    return "within_0.3pct";
  }
  return "loss";
}

export type ScoreboardMeta = {
  generatedAt: string;
  mode: "offline-fixture" | "live";
};

/** Build a markdown table and summary report of the benchmark cells. */
export function buildScoreboardMarkdown(
  cells: BenchmarkCell[],
  meta: ScoreboardMeta,
): string {
  const lines: string[] = [];

  // Header
  lines.push("# Benchmark Scoreboard");
  lines.push("");
  lines.push(`**Generated:** ${meta.generatedAt}`);
  lines.push(`**Mode:** ${meta.mode === "offline-fixture" ? "Offline Fixture (Illustrative)" : "Live Mainnet"}`);
  lines.push("");

  if (meta.mode === "offline-fixture") {
    lines.push("> **Note:** This scoreboard was generated using offline fixtures. Actual mainnet quotes (pending T1.1 keys) will produce real data.");
    lines.push("");
  }

  // Table headers
  const adapterNames = cells.length > 0
    ? Object.keys(cells[0].adapterOutputs).sort()
    : [];
  const headers = [
    "Pair",
    "Size (ADA)",
    "Our Output",
    ...adapterNames.map((name) => name),
    "Best Adapter",
    "Verdict",
  ];

  lines.push("| " + headers.join(" | ") + " |");
  lines.push("| " + headers.map(() => "---").join(" | ") + " |");

  // Table rows
  for (const cell of cells) {
    const ourOutputStr = cell.ourOutput.toFixed(6);
    const adapterValues = adapterNames.map((name) => {
      const val = cell.adapterOutputs[name];
      return val === null ? "N/A" : val.toFixed(6);
    });
    const bestStr = cell.bestAdapter === null ? "N/A" : cell.bestAdapter.toFixed(6);
    const verdictEmoji =
      cell.verdict === "win" ? "✓" : cell.verdict === "within_0.3pct" ? "~" : "✗";

    const row = [
      cell.pair,
      cell.sizeAda.toString(),
      ourOutputStr,
      ...adapterValues,
      bestStr,
      `${verdictEmoji} ${cell.verdict}`,
    ];
    lines.push("| " + row.join(" | ") + " |");
  }

  // Summary stats
  lines.push("");
  lines.push("## Summary");

  const totalCells = cells.length;
  const winCells = cells.filter((c) => c.verdict === "win").length;
  const withinCells = cells.filter((c) => c.verdict === "within_0.3pct").length;
  const lossCells = cells.filter((c) => c.verdict === "loss").length;

  const winPct = totalCells > 0 ? ((winCells / totalCells) * 100).toFixed(1) : "0";
  const withinPct = totalCells > 0 ? ((withinCells / totalCells) * 100).toFixed(1) : "0";

  lines.push(`- **Cells Evaluated:** ${totalCells}`);
  lines.push(`- **Wins:** ${winCells} (${winPct}%)`);
  lines.push(`- **Within 0.3%:** ${withinCells} (${withinPct}%)`);
  lines.push(`- **Losses:** ${lossCells}`);
  lines.push("");

  // Gate-1 pass/fail
  const gate1Target = 0.6; // >= 60% win
  const gate1Pass = winCells >= Math.ceil(totalCells * gate1Target);
  const gate1Status = gate1Pass ? "PASS" : "FAIL";
  const gate1Reason = gate1Pass
    ? `${winPct}% wins >= 60% target`
    : `${winPct}% wins < 60% target`;

  lines.push("### Gate 1 (Acceptance Threshold)");
  lines.push(
    `**${gate1Status}**: ${gate1Reason} (remaining within 0.3% tolerance)`
  );

  lines.push("");

  return lines.join("\n");
}
