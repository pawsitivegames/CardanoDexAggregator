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
- ✅ **T1.5 Minswap V2** → `src/protocols/minswapV2/` (types, decode, quote, fixtures, tests). 14 tests pass: spec-formula exact match, k-invariant property, monotonicity, Dexter cross-check, datum-reserves-over-value decode. Math = `Δy=((fd−fn)·Δx·y0)/(x0·fd+(fd−fn)·Δx)` floor, per-direction fee numerators.
  - 🟡 **Gap:** decode test uses a *synthetic* CBOR datum; full validation of real datum field indices needs a real mainnet pool snapshot (blocked on T1.1 keys / network). And the plan's "within 0.1% of the protocol's own live API" acceptance is not yet recorded — needs network. Track as Gate-1 evidence TODO.
- ⬜ T1.5 Minswap Stableswap (Curve invariant, amp A, multiples decimals) — spec: `vendor/reference/minswap-stableswap/stableswap-docs/`.
- ⬜ T1.5 SundaeSwap V3 (decaying fee at slot; subtract `protocol_fees` from ADA reserve).
- ⬜ T1.5 WingRiders V2 (true reserves = value − treasury/agent-fee − staking ADA).
- ⬜ T1.5 Splash (classic CFMM only), VyFinance (vyfi.io LP enumerate), MuesliSwap (pools), Genius Yield (orderbook), Saturn (keep API adapter).
- ⬜ **T1.6 [HAIKU→OPUS]** Unified `PoolSnapshot` registry (the core abstraction — Opus reviews shape).

### 1.3 Indexing & freshness
- ⬜ T1.7 Pool cache service (per-block refresh, staleness stamps). ⬜ T1.8 [OPUS] Evaluate Iris.

### 1.4 Pathfinding & splits
- ⬜ T1.9 [HAIKU→OPUS] Route graph + cross-protocol split (extend `src/domain/aggregator.ts`). ⬜ T1.10 Benchmark harness vs 4 third-party adapters.

## Blockers / human actions
1. **Keys (T1.1):** human must create Maestro + Blockfrost accounts and fill `.env`. Until then, protocol modules are spec/fixture-validated only; live-API accuracy checks and real on-chain fixtures cannot run.
2. **Commits:** changes are unstaged; awaiting user authorization to commit/branch.

## Verified test commands
- `npx vitest run src/chain/poolStateProvider.test.ts` → 11 pass
- `npx vitest run src/protocols/minswapV2/quote.test.ts` → 14 pass
- Full suite: 17 files / 134 tests pass.
