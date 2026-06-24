# Gate 1 - Own the routing engine

**Status:** NO-GO for Phase 2. Offline engineering evidence passes, but the first live
mainnet benchmark fails because owned live pool coverage is still too narrow.

## Acceptance evidence

- `npm test` passes: 28 test files, 310 tests.
- `npm run benchmark` writes `docs/benchmarks/scoreboard.md`.
- Offline fixture benchmark result: 21 cells evaluated, 14 wins (66.7%), 7 within 0.3%,
  0 losses.
- Gate threshold from the plan is met in offline mode: our router wins >=60% of benchmark
  cells and is within 0.3% on the rest.
- Blockfrost mainnet fallback credential smoke check passed on 2026-06-13:
  latest block height 13542900, slot 189752555. This proves the fallback provider key is
  usable, but it is not the plan's live pool fixture/quote-accuracy acceptance.
- Maestro mainnet primary credential smoke checks passed on 2026-06-13:
  direct and local-proxy `/blocks/latest` reads returned height 13542968, slot 189753970.
  Provider normalization was updated to read Maestro's live `absolute_slot` field.
- `npm run benchmark:live` writes `docs/benchmarks/scoreboard-live.md`.
- Latest live benchmark result on 2026-06-13 after adding Minswap-discovered owned pool
  quotes: 21 cells evaluated, 3 wins (14.3%), 3 within 0.3% (14.3%), 15 losses. Gate
  threshold is not met.
- Implemented routing path:
  `PoolStateProvider` -> protocol decoders/math -> `PoolSnapshot` registry -> route graph
  -> fixed-cost-aware split router -> benchmark harness.
- Implemented pool protocols in the unified registry: Minswap V2, Minswap Stableswap,
  SundaeSwap V3, WingRiders V2, Splash classic CFMM, VyFinance pools, MuesliSwap pools.

## Open risks

- Owned live pool quoting currently covers ADA/SNEK plus Minswap/MinswapV2 direct paths
  discovered from Minswap route metadata (notably ADA/MIN and MIN/SNEK). Several benchmark
  pairs still produce no owned quote or require non-Minswap venues, so they fail closed in
  the live scoreboard.
- SundaeSwap V3 direct-pool data did not load in the live run; the current adapter still
  depends on Blockfrost/proxy-style access and needs real fixture capture/decoder wiring.
- Several competitor adapters were unavailable in the CLI run (notably Steelswap token
  metadata and Cardexscan timeouts), so the current live scoreboard is useful as a gate
  failure signal, not as final market-quality quote evidence.
- The plan's protocol-level live acceptance still needs recorded mainnet pool UTxOs and
  quote outputs within 0.1% of each protocol's own API/frontend at the fixture block.
- Lower-priority book venues are not owned on-chain yet: Genius Yield orderbook and
  MuesliSwap orderbook aggregation are deferred; Saturn remains an API benchmark adapter.
- Several datum tests use synthetic CBOR. They protect local field handling but do not yet
  prove every real datum field index against mainnet snapshots.
- Splash weighted/stable/TLB pools and WingRiders stable invariant are intentionally out
  of scope until Phase 3 coverage expansion unless live Gate 1 requires them.

## Recommendation

**NO-GO to Phase 2 execution work.**

**GO to expand owned live pool fixture capture and decoder wiring for the benchmark
basket, starting with Minswap V2 and Minswap Stableswap pairs beyond ADA/SNEK.** The
offline router is strong enough to justify that next step, but Phase 2 must stay blocked
until live mainnet evidence meets the plan threshold.
