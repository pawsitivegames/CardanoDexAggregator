// Offline fixture data for the benchmark. Deterministic synthetic quotes so the harness
// runs with NO network/keys and every basket cell is covered. These are ILLUSTRATIVE only
// — real numbers require live Maestro/Blockfrost keys (T1.1) wired into the runner.

export type FixtureQuote = Record<string, number | null>;

const ADAPTERS = ["aggregator", "cardexscan", "steelswap", "saturnswap"] as const;

/** Notional output-per-1-ADA for each pair (rough mainnet-ish scale, illustrative). */
const PAIR_RATE: Record<string, number> = {
  "lovelace::279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b": 468, // ADA/SNEK
  "lovelace::c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d": 0.5, // ADA/USDM
  "lovelace::f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880069555344": 0.49, // ADA/iUSD
  "lovelace::29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e": 53, // ADA/MIN
  "lovelace::1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e776f726c646d6f62696c65746f6b656e": 6.4, // ADA/WMT
  "c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d::f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880069555344": 0.98, // USDM/iUSD
  "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e::279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b": 8.8, // MIN/SNEK
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Deterministic synthetic adapter quotes for any pair/size. Base output = rate × size,
 * minus a small per-adapter spread; one adapter is occasionally null (pair unsupported).
 */
export function getOfflineAdapterQuotes(
  inputAssetId: string,
  outputAssetId: string,
  sizeAda: number,
): FixtureQuote {
  const pairKey = `${inputAssetId}::${outputAssetId}`;
  const rate = PAIR_RATE[pairKey] ?? 1;
  const base = rate * sizeAda;
  const out: FixtureQuote = {};
  for (const adapter of ADAPTERS) {
    const h = hash(`${pairKey}::${sizeAda}::${adapter}`);
    // null ~1 in 6 (adapter doesn't cover this pair).
    if (h % 6 === 0) {
      out[adapter] = null;
      continue;
    }
    // Spread 0–0.6% below base, deterministic.
    const spreadPct = (h % 60) / 10000;
    out[adapter] = base * (1 - spreadPct);
  }
  return out;
}

/**
 * Illustrative offline quote from our router: derived from the best adapter so the offline
 * scoreboard demonstrates the Gate-1 classification. Replaced by real buildLegs+routeSplit
 * in live mode (see ourRouter.ts).
 */
export function getOfflineOurRouterQuote(
  inputAssetId: string,
  outputAssetId: string,
  sizeAda: number,
): number {
  const adapterQuotes = getOfflineAdapterQuotes(inputAssetId, outputAssetId, sizeAda);
  const adapterValues = Object.values(adapterQuotes).filter((v): v is number => v !== null);
  if (adapterValues.length === 0) return 0;
  const best = Math.max(...adapterValues);
  const rand = hash(`${inputAssetId}::${outputAssetId}::${sizeAda}`) % 100;
  // 65% win (slightly beat best), else within the 0.3% band.
  return rand < 65 ? best * 1.001 : best * 0.998;
}
