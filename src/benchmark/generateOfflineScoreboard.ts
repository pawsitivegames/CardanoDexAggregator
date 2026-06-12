// CLI entry for generating the offline benchmark scoreboard.
// Run with: npx tsx src/benchmark/generateOfflineScoreboard.ts

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { runBenchmarkToMarkdown } from "./runner";
import { getOfflineOurRouterQuote, getOfflineAdapterQuotes } from "./offlineFixtures";

async function main() {
  const scoreboard = runBenchmarkToMarkdown({
    ourQuote: getOfflineOurRouterQuote,
    adapterQuotes: getOfflineAdapterQuotes,
    meta: {
      generatedAt: new Date().toISOString(),
      mode: "offline-fixture",
    },
  });

  const docDir = join(process.cwd(), "docs", "benchmarks");
  if (!existsSync(docDir)) {
    mkdirSync(docDir, { recursive: true });
  }

  const filePath = join(docDir, "scoreboard.md");
  writeFileSync(filePath, scoreboard, "utf-8");

  console.log(`Scoreboard written to ${filePath}`);
  console.log("\nFirst 30 lines:");
  console.log(scoreboard.split("\n").slice(0, 30).join("\n"));
}

main().catch((err) => {
  console.error("Failed to generate scoreboard:", err);
  process.exit(1);
});
