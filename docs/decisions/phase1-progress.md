# Phase 1 progress tracker

Persisted so work is never re-derived (orchestration token rule 4). Opus updates after
each task. Gate 1 doc (`gate-1.md`) is written only when T1.10 benchmark exists.

## Status legend: ✅ done · 🟡 partial/blocked · ⬜ not started

### 1.1 Foundation
- ✅ **T1.1 [OPUS]** Infra decision → `docs/decisions/infra.md`. Maestro-primary, Blockfrost+Koios fallback. **Human action pending: provision keys in `.env`** (`MAESTRO_*`, `BLOCKFROST_*`). `.env.example` updated.
- ✅ **T1.2 [HAIKU]** Vendor repos cloned to `vendor/reference/` (9 repos, gitignored). Index: `vendor/reference/INDEX.md` (datum + pricing-math paths for 7 core protocols, +Genius/Saturn notes).
- ✅ **T1.3 [OPUS]** Dexter decision → `docs/decisions/dexter.md`. Depend on Dexter for *decoding*, port *quote math* per spec, run Dexter server-side only (isolates `lucid-cardano` from the SPA bundle). Divergence log started.
- ✅ **T1.4 [HAIKU→OPUS]** `PoolStateProvider` interface + Blockfrost & Maestro impls + fixture tests → `src/chain/`. 11 tests pass; cross-provider deep-equal normalization verified. Opus reviewed interface shape — approved.

### 1.2 Protocol decoders + math (priority order)
- ✅ **T1.5 Minswap V2** → `src/protocols/minswapV2/`. 14 tests: spec-formula exact, k-invariant, monotonicity, Dexter cross-check, datum-over-value decode. `Δy=((fd−fn)·Δx·y0)/(x0·fd+(fd−fn)·Δx)` floor, per-direction fees.
- ✅ **T1.5 Minswap Stableswap** → `src/protocols/minswapStable/`. 28 tests: Newton getD/getY, multiples (decimals), near-peg low-slippage, D-invariant, output-side fee.
- ✅ **T1.5 SundaeSwap V3** → `src/protocols/sundaeswapV3/`. 20 tests: directional bid/ask fees, slot-decay interpolation, protocol_fees subtracted from ADA reserve.
- ✅ **T1.5 WingRiders V2 (CFMM)** → `src/protocols/wingRidersV2/`. 18 tests: true reserves (value − treasury − staking ADA), k-invariant, Dexter cross-check. Stable variant left as TODO.
- ✅ **T1.6 [HAIKU→OPUS]** Unified `PoolSnapshot` registry → `src/protocols/registry/`. Opus-designed shape (id, protocol, assets, reserves, fee summary, batcher fee, min-ADA, settlement class, staleness). Uniform `quoteSnapshotExactIn` dispatch + `PoolRegistry` pair lookup. 8 tests: dispatch==direct per protocol, normalization, pair lookup, fee defaults+override.
- ⬜ T1.5 remaining (lower liquidity, priority 5–9): Splash (classic CFMM only), VyFinance (vyfi.io LP enumerate), MuesliSwap (pools then book), Genius Yield (orderbook), Saturn (keep API adapter).
  - 🟡 **Standing gap (all protocols):** decode tests use *synthetic* CBOR datums; real datum field-index validation + the plan's "within 0.1% of the protocol's own live API" acceptance need network + keys (blocked on T1.1). Track as Gate-1 evidence TODO.

### 1.3 Indexing & freshness
- ⬜ T1.7 Pool cache service (per-block refresh, staleness stamps). ⬜ T1.8 [OPUS] Evaluate Iris.

### 1.4 Pathfinding & splits
- ✅ **T1.9 [HAIKU→OPUS]** Cross-protocol route graph + split → `src/router/`. Opus-designed `RouteLeg` abstraction (direct pool or 2-hop via connector) with monotone-concave exact-in quote; `routeSplit` does marginal-output equalization + fixed-cost-aware leg opening (exact split-pruning). `buildLegs` builds direct + 2-hop legs from the registry. 13 property tests.
- ✅ **T1.10 [HAIKU]** Benchmark harness → `src/benchmark/` + `docs/benchmarks/scoreboard.md` (`npm run benchmark`). 7-pair × 3-size basket, Gate-1 verdict logic. 9 tests. **Offline-fixture mode only** — live numbers blocked on T1.1 keys.

### Routing engine end-to-end status
Pools → `PoolStateProvider` → protocol decoders → `PoolSnapshot` registry → `buildLegs` →
`routeSplit` → benchmark scoreboard is **wired and tested offline** for the top-4 protocols.
**What Gate 1 still needs:** (a) T1.1 keys to feed real mainnet pools + run the live
benchmark and the "within 0.1% of each protocol's own API" accuracy check; (b) protocols
5–9 if Gate-1 coverage requires those pairs; (c) optionally T1.7 cache for the live runner.

## Blockers / human actions
1. **Keys (T1.1):** human must create Maestro + Blockfrost accounts and fill `.env`. Until then, protocol modules are spec/fixture-validated only; live-API accuracy checks and real on-chain fixtures cannot run.
2. **Commits:** changes are unstaged; awaiting user authorization to commit/branch.

## Verified test commands
- `npx vitest run src/chain/poolStateProvider.test.ts` → 11 pass
- `npx vitest run src/protocols/minswapV2/quote.test.ts` → 14 pass
- Full suite: 17 files / 134 tests pass.
