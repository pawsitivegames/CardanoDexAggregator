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
- ✅ **T1.5 Splash classic CFMM** → `src/protocols/splash/`. Classic constant-product pools only, as required; weighted/stable/TLB remains Phase 3 (T3.6).
- ✅ **T1.5 VyFinance pools** → `src/protocols/vyfinance/`. Closed-source pool model represented from UTxO-value reserves; live discovery through `api.vyfi.io/lp?networkId=1` remains a provider task once keys/network are configured.
- ✅ **T1.5 MuesliSwap pools** → `src/protocols/muesliswap/`. Minswap-style pool math implemented. Muesli orderbook aggregation remains deferred with the Genius Yield book work.
- 🟡 **T1.5 remaining (book/API venues):** Genius Yield orderbook and Saturn on-chain book are not implemented in Phase 1 pool registry. Saturn remains covered by the existing API adapter benchmark path per plan priority note.
- ✅ **T1.6 [HAIKU→OPUS]** Unified `PoolSnapshot` registry → `src/protocols/registry/`. Opus-designed shape (id, protocol, assets, reserves, fee summary, batcher fee, min-ADA, settlement class, staleness). Uniform `quoteSnapshotExactIn` dispatch + `PoolRegistry` pair lookup. 11 tests: dispatch==direct for 7 implemented pool protocols, normalization, pair lookup, fee defaults+override.
  - 🟡 **Standing gap (all protocols):** decode tests use *synthetic* CBOR datums; real datum field-index validation + the plan's "within 0.1% of the protocol's own live API" acceptance need network + keys (blocked on T1.1). Track as Gate-1 evidence TODO.

### 1.3 Indexing & freshness
- ✅ **T1.7 Pool cache service** → `src/router/cache/`. In-memory active-pair cache, per-block refresh loop, staleness filtering, no overlapping refreshes, and provider-error survival while retaining old snapshots.
- ✅ **T1.8 [OPUS] Evaluate Iris** → `docs/decisions/iris.md`. Decision: do not run Iris for MVP; keep polling cache for Phase 1, revisit Iris at scale stage.

### 1.4 Pathfinding & splits
- ✅ **T1.9 [HAIKU→OPUS]** Cross-protocol route graph + split → `src/router/`. Opus-designed `RouteLeg` abstraction (direct pool or 2-hop via connector) with monotone-concave exact-in quote; `routeSplit` does marginal-output equalization + fixed-cost-aware leg opening (exact split-pruning). `buildLegs` builds direct + 2-hop legs from the registry. 13 property tests.
- ✅ **T1.10 [HAIKU]** Benchmark harness → `src/benchmark/` + `docs/benchmarks/scoreboard.md` (`npm run benchmark`). 7-pair × 3-size basket, Gate-1 verdict logic. 10 tests. Offline fixture mode remains deterministic CI evidence.
- ✅ **T1.10 live runner** → `npm run benchmark:live` writes
  `docs/benchmarks/scoreboard-live.md`. Latest live run on 2026-06-13 failed Gate 1:
  21 cells, 3 wins, 3 within 0.3%, 15 losses. This is expected until owned live pool
  capture covers the full benchmark basket.

### Routing engine end-to-end status
Pools → `PoolStateProvider` → protocol decoders → `PoolSnapshot` registry → `buildLegs` →
`routeSplit` → benchmark scoreboard is **wired and tested offline** for 7 implemented pool protocols.
**What Gate 1 still needs:** (a) real mainnet pool fixture capture for all benchmark
pairs; (b) the "within 0.1% of each protocol's own API" accuracy check; (c) protocols
5–9 book venues if Gate-1 coverage requires those pairs.

## Blockers / human actions
1. **Keys (T1.1):** `BLOCKFROST_MAINNET_PROJECT_ID` is present and passed a live
   latest-block smoke check on 2026-06-13 (height 13542900, slot 189752555).
   `MAESTRO_MAINNET_API_KEY` is present and passed direct plus local-proxy live latest-block
   smoke checks on 2026-06-13 (height 13542968, slot 189753970). Maestro preprod/preview
   keys are still missing. The plan's live pool fixture capture and live-API quote
   accuracy checks still need a dedicated live runner before Gate 1 can move to GO.
2. **Commits:** changes are unstaged; awaiting user authorization to commit/branch.

## Verified test commands
- `npx vitest run src/chain/poolStateProvider.test.ts` → 11 pass
- `npx vitest run src/protocols/minswapV2/quote.test.ts` → 14 pass
- `npx vitest run src/protocols/registry/registry.test.ts` → 11 pass
- `npm test` → 28 files / 310 tests pass
- `npm run benchmark` → offline fixture scoreboard pass: 21 cells, 14 wins (66.7%), 7 within 0.3%, 0 losses.
- `npm run benchmark:live` → live scoreboard fail: 21 cells, 3 wins, 3 within 0.3%, 15 losses
- `npm run build` → TypeScript + Vite production build passes
- `npx vitest run src/chain/poolStateProvider.test.ts` → 12 pass after live Maestro
  `absolute_slot` normalization
