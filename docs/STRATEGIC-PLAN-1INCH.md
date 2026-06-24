# ClearRoute → "1inch of Cardano" Implementation Plan

**Status:** Researched 2026-06-12. No code in this document — it is an orchestration plan.
**Audience:** An orchestrator model (e.g. Opus) dispatching tasks to a cheap worker model
(e.g. Haiku). Humans review at phase gates only.
**Relationship to other docs:** This is the single active plan. Older remediation
roadmaps and TODO backlogs have been deleted; audit findings remain in `docs/AUDIT.md`
and `docs/ENHANCED-AUDIT.md` as reference only. Remediation items found there may be
interleaved but must not block Phase 1 here.

---

## 0. Strategy & unique positioning (read first, do not re-litigate)

Research conclusions this plan is built on (verified June 2026):

1. **Reuse, don't re-derive.** Open-source MIT libraries already decode pool datums and
   build orders for nearly every Cardano DEX:
   - **Dexter** (TypeScript, Indigo Labs): github.com/IndigoProtocol/dexter — Minswap V1/V2,
     SundaeSwap V1/V3, WingRiders, VyFinance, MuesliSwap, Spectrum/Splash. Pool fetching via
     Blockfrost/Kupo, datum parsing, order building via Lucid, split swaps, cancellation.
   - **Iris** (TypeScript, Indigo Labs): github.com/IndigoProtocol/iris — multi-DEX chain
     indexer (pools, swaps, orders) with REST + websocket.
   - **Charli3 Dendrite** (Python, reference for math/edge cases): github.com/Charli3-Official/charli3-dendrite
   - Official SDKs: minswap/sdk, SundaeSwap-finance/sundae-sdk, WingRiders/dex-serializer,
     geniusyield/smart-order-router (all MIT/Apache-2.0).
   This cuts Phase 1–2 cost by an estimated 60–70%.

2. **eUTXO reality.** Almost all Cardano AMMs settle via batcher/escrow orders: you never
   spend the pool UTxO; you lock an order UTxO with a min-receive bound and a batcher fills
   it 1–3 blocks later. Therefore: (a) "own execution" = building each DEX's order datum
   correctly, not an atomic router contract; (b) cross-DEX splits are N independent orders
   with independent fill risk; (c) quotes drift between quote-time and fill-time — slippage
   bounds and settlement modeling are first-class concerns, not afterthoughts.
   Exceptions (direct fill, ~1 block): Genius Yield orderbook (permissionless matching),
   Saturn CLOB, MuesliSwap order placement.

3. **Unique positioning (the wedge).** Market gaps, ranked by evidence:
   - **G1 Fee & surplus transparency** — DexHunter (market leader) hides its fee; users
     complain publicly. No Cardano aggregator publishes a verifiable fee/positive-slippage
     policy. We ship an always-visible fee breakdown + "surplus returned" guarantee.
   - **G2 Settlement-time visibility & stuck-order handling** — batcher execution is an
     opaque wait. Real-time order tracking, fill ETA per DEX, auto-retry/auto-cancel is a
     clear differentiator nobody has.
   - **G3 Wallet API second source** — Lace & Eternl embed SteelSwap (single-maintainer
     risk); VESPR/Begin embed DexHunter (fee opacity). Wallets are openly multi-provider.
     A documented, SLA-backed quote+build API with rev-share wins embeds. **The API is the
     product; our UI is the demo.**
   - **G4 No 1inch-Fusion analog exists on Cardano** — intent auctions with competing
     solvers. eUTXO is naturally intent-shaped; this is the long-term moat (Phase 5).
   Product identity: **"The transparent, settlement-aware Cardano aggregator, built as an
   API wallets can embed."**

4. **Monetization model (from 1inch research):** 0% headline fee tolerance is the norm;
   value captured via (a) explicit small bps fee line-item in the order (transparent — our
   differentiator allows charging 0.1–0.3% openly where DexHunter hides more), (b) positive
   slippage split disclosed to the user, (c) paid API tiers + rev-share for wallets.

5. **Infrastructure (cheapest-viable, from infra research):**
   - **MVP:** Maestro entry tier (UTxO state + mempool-aware DEX price API + Tx Manager
     submit) + Blockfrost free + Koios free as fallbacks. ~$0–80/mo, near-zero ops.
   - **Alternative with zero migration cost later:** Demeter.run hosted Ogmios+Kupo
     (~$10–40/mo usage-based) — same code paths as future self-hosting.
   - **Scale stage:** one Hetzner dedicated box (~€60/mo) running cardano-node (Mithril
     bootstrap) + Ogmios + Kupo pruned to DEX script patterns; own mempool + own submit.
   - Submit txs to two endpoints in parallel; confirm via own indexer.

6. **Existing assets in this repo to preserve:** domain layer net-output ranking
   (`src/domain/quoteEngine.ts`), split math (`src/domain/aggregator.ts`), execution state
   machine (`src/domain/executionMachine.ts`), fee model (`src/domain/fees.ts`), CIP-30
   wallet layer (`src/wallet/`), adapter test patterns, CI. The 4 third-party aggregator
   adapters (Minswap Agg, DexHunter, Steelswap, Cardexscan) are **demoted to benchmarks**
   — we must beat them, and they become the regression oracle for our router.

---

## Orchestration protocol (Opus: follow this exactly)

**Roles.**
- **Opus (you):** sequencing, task dispatch, gate reviews, integration decisions, resolving
  Haiku failures after 2 attempts, anything marked `[OPUS]`.
- **Haiku:** every task marked `[HAIKU]` — porting decoders, writing tests from fixtures,
  mechanical adapters, docs, config. Haiku prompts must be **self-contained**: include the
  exact file paths, the datum spec excerpt or reference repo path, the expected
  output-file path, and the acceptance command to run. Haiku never decides architecture.
- Tasks marked `[HAIKU→OPUS]`: Haiku produces, Opus reviews the diff before merge.

**Token rules (priority: cheap).**
1. Never paste whole files into prompts. Give Haiku a path + line range or a spec excerpt.
2. Clone reference repos ONCE into `vendor/reference/` (read-only, gitignored); point Haiku
   at specific files in them instead of re-fetching web docs.
3. Every task ends with a runnable acceptance command (`npm test -- <file>`); Haiku
   iterates against the command, not against Opus review cycles.
4. Persist all decisions/notes to `docs/decisions/` files immediately; never re-derive.
5. One protocol = one task = one PR-sized diff. No batching unrelated work.
6. Record per-protocol fixtures (real mainnet pool UTxOs as JSON) once in
   `src/adapters/__fixtures__/`; all tests run off fixtures, no network in CI.
7. Skip work explicitly: pairs/protocols below liquidity thresholds are out of scope until
   Phase 3 (see protocol priority list).

**Protocol priority order (by mainnet liquidity/volume — do them in this order):**
1. Minswap V2, 2. Minswap Stableswap, 3. SundaeSwap V3, 4. WingRiders V2 (+stable),
5. Splash (classic CFMM pools only at first), 6. VyFinance, 7. MuesliSwap (pools then
orderbook), 8. Genius Yield orderbook, 9. Saturn CLOB (keep existing API adapter; on-chain
later or never). **Axo is dead (shut down 2025-03) — exclude everywhere.**

**Phase gates.** At the end of each phase, Opus writes `docs/decisions/gate-<phase>.md`
with: acceptance evidence, open risks, and a GO/NO-GO recommendation. The human reviews
gates only.

---

## Phase 1 — Own the routing engine (read-only)

**Goal:** Quote any supported pair from raw on-chain pool state and demonstrably match or
beat the third-party aggregators on a benchmark set. No execution changes.
**Duration guess:** 4–6 weeks of orchestrated work. **Make-or-break milestone.**

### 1.1 Foundation
- **T1.1 [OPUS] Infra decision + keys.** Choose Maestro-primary vs Demeter Ogmios+Kupo
  (default: Maestro entry tier; Demeter if the human prefers open APIs). Document in
  `docs/decisions/infra.md`. Human action: create accounts, put keys in `.env`.
- **T1.2 [HAIKU] Vendor reference repos.** Shallow-clone dexter, iris, charli3-dendrite,
  minswap/sdk, sundae-sdk, minswap-dex-v2 (specs), minswap-stableswap (specs),
  sundae-contracts, WingRiders/dex-serializer into `vendor/reference/`; add to
  `.gitignore`; write `vendor/reference/INDEX.md` listing where each protocol's datum
  definitions and math live (file paths). Acceptance: INDEX.md lists ≥1 datum-definition
  path and ≥1 pricing-math path per protocol.
- **T1.3 [OPUS] Decide build-vs-depend for Dexter.** Evaluate: depend on
  `@indigo-labs/dexter` npm package directly vs port its decoders into our codebase.
  Default recommendation: **depend for pool fetching/decoding in MVP**, port selectively
  where its math diverges from specs (record divergences in `docs/decisions/dexter.md`).
  This single decision can save weeks — spend real thought here.
- **T1.4 [HAIKU] Pool-state provider interface.** Define a `PoolStateProvider` TypeScript
  interface in `src/chain/` (UTxOs at script pattern, datum resolution, chain tip, raw tx
  submit) with two implementations: Maestro-backed and Blockfrost-backed (reuse existing
  proxy patterns in `server.mjs`). Fixture-driven tests. Acceptance: both providers return
  identical normalized pool UTxO shape for a recorded fixture.

### 1.2 Protocol decoders + quoting math (one task per protocol, priority order)
For each protocol P in the priority list:
- **T1.5.P [HAIKU] Decoder + math.** Using `vendor/reference/INDEX.md` pointers, implement
  (or wrap from Dexter): pool discovery (script address/NFT pattern), datum decode,
  reserve normalization, and `quoteExactIn(pool, amountIn) → amountOut` with exact fee
  handling. Output: one module per protocol in `src/protocols/<name>/`, fixture tests with
  ≥3 real mainnet pool snapshots, including the protocol's known quirks (see below).
  Acceptance: unit tests pass; quoted output within 0.1% of the protocol's own
  API/frontend quote for the fixture block (record comparison in the test).
- **Known quirks Haiku prompts MUST include verbatim:**
  - Minswap V2: use **datum reserves, not UTxO value** (value includes fee-sharing
    accruals); per-direction fees `base_fee_a/b_numerator`/10000; dynamic-fee flag.
    Spec: minswap-dex-v2 `amm-v2-docs/amm-v2-specs.md`.
  - Minswap Stableswap: Curve invariant with amp `A` and `multiples` decimal array.
    Spec: minswap-stableswap `stableswap-docs/stableswap-spec.md`.
  - SundaeSwap V3: directional `bid/ask_fees_per_10_thousand`; **decaying fee evaluated at
    current slot**; subtract accumulated `protocol_fees` from ADA value for true reserve;
    scooper config lives in a global settings datum (reference input).
  - WingRiders V2: true reserves = UTxO value − treasury/agent-fee datum fields − staking
    rewards ADA; shared codebase for CFMM and stableswap (invariant differs only).
  - VyFinance: closed-source; pool discovery via `api.vyfi.io/lp?networkId=1` (enumerate
    pool addresses), reserves from UTxO value; 0.3% LP + bar fee.
  - Splash: start with classic CFMM pools (Spectrum-style pool NFT + feeNum datum); skip
    weighted/stable/TLB pools until Phase 3 (T3.6).
  - MuesliSwap pools: Minswap-style fork. Orderbook: each order = one UTxO with price
    datum — defer book aggregation to the Genius Yield/MuesliSwap book tasks.
  - Genius Yield: pure orderbook; index `PartialOrderDatum` UTxOs into a book; quoting =
    walking the book.
- **T1.6 [HAIKU→OPUS] Unified pool registry.** Normalize all protocols into one
  `PoolSnapshot` model (id, protocol, assets, reserves/book, fee schedule, batcher fee,
  min-ADA, settlement class: `batcher|direct`) feeding the existing domain layer. Opus
  reviews the model shape — it is the core abstraction everything else builds on.

### 1.3 Indexing & freshness
- **T1.7 [HAIKU] Pool cache service.** In-memory pool cache refreshed per block (~20s):
  poll provider for pools relevant to active pairs only (token-efficiency rule 7).
  Staleness stamps on every snapshot; reuse existing staleness gating in `quoteEngine.ts`.
  Acceptance: cache serves quotes <50ms; refresh loop survives provider errors.
- **T1.8 [OPUS] Evaluate Iris.** Decide whether running Iris (Indigo's open-source
  multi-DEX indexer) replaces T1.7's polling for the scale stage. Document; do not build.

### 1.4 Pathfinding & splits
- **T1.9 [HAIKU→OPUS] Route graph + pathfinder.** Tokens = nodes, pools = edges. Direct +
  2-hop routes (via ADA and via top connector tokens: USDM, iUSD, SNEK). Objective:
  **net output after deterministic costs** — per-order batcher fee + network fee +
  min-ADA deposits (Cardano advantage over 1inch: costs are exact, so split-pruning is
  exact: a split across N venues costs N batcher fees; prune any split whose marginal
  output gain < marginal fixed cost). Extend the existing `computeOptimalSplit` in
  `src/domain/aggregator.ts` from single-protocol to cross-protocol allocation.
  Opus designs the allocation algorithm (marginal-output equalization across pools is the
  standard approach); Haiku implements + property tests (e.g. split output ≥ best single
  pool output − fixed costs; monotonicity in input size).
- **T1.10 [HAIKU] Benchmark harness.** Script comparing our router's quotes vs the 4
  existing third-party aggregator adapters across a fixed basket (ADA/SNEK, ADA/USDM,
  ADA/iUSD, ADA/MIN, ADA/WMT + 2 non-ADA pairs) × 3 sizes (100, 5k, 50k ADA). Outputs a
  markdown scoreboard to `docs/benchmarks/`. Run on demand, results committed.

### Gate 1 (GO/NO-GO for everything that follows)
Our router ≥ best third-party quote on ≥60% of benchmark cells and within 0.3% on the
rest. If we cannot reach this, **stop and reassess** (fallback strategy: become the
transparency/settlement UX layer on top of others' routing — gaps G1/G2 still hold).

---

## Phase 2 — Own execution (preprod first, then mainnet behind gate)

**Goal:** Build and submit real DEX orders ourselves — no dependence on Minswap's
build-tx API. Settlement-aware from day one.
**Duration guess:** 5–8 weeks.

### 2.1 Transaction building
- **T2.1 [OPUS] Tx-builder library decision.** Lucid Evolution vs Mesh vs Blaze.
  Considerations: Dexter uses Lucid (order-building code reusable); sundae-sdk supports
  Lucid and Blaze. Default: **Lucid Evolution** for ecosystem reuse. Document.
- **T2.2.P [HAIKU] Order builders per protocol** (priority order, top 4 protocols first:
  Minswap V2, Minswap Stable, SundaeSwap V3, WingRiders V2). Build the order UTxO datum
  (swap exact-in, min-receive bound, refund address, deadline where supported) using
  official SDKs/Dexter as reference. Each: preprod integration test that places AND
  cancels a real order. Acceptance: order accepted by validator (cancellation succeeds =
  datum well-formed) on preprod; one witnessed fill per protocol.
- **T2.3 [HAIKU] Direct-fill builders.** Genius Yield (taker fill of order UTxOs) and
  Saturn (via API/SDK — contracts closed). These settle in ~1 block with no batcher —
  they anchor the "fast lane" of settlement-aware routing.
- **T2.4 [HAIKU] Split execution.** One user signature covering N order outputs in a
  single tx where possible (multiple order UTxOs to different DEX validators in one tx is
  valid on Cardano); fall back to sequential signing only if size limits force it.
  Integrate with existing `executionMachine.ts` states.

### 2.2 Settlement tracking (differentiator G2)
- **T2.5 [HAIKU] Order lifecycle tracker.** Extend existing `txTracker.ts`: per order —
  submitted → in-mempool → order UTxO confirmed → filled (order UTxO spent by batcher,
  proceeds at user address) → or expired/stuck. Detect fills by watching the order UTxO's
  spend. Auto-cancel path after configurable deadline.
- **T2.6 [HAIKU] Settlement telemetry.** Persist per-protocol fill latency and failure
  rate (rolling 24h) from our own orders + observed chain activity. This dataset feeds
  ranking (T2.7) and the public ETA UI. Storage: start with SQLite/JSON via the Node
  service; Supabase if/when multi-instance.
- **T2.7 [HAIKU→OPUS] Settlement-aware ranking.** Extend `quoteEngine.ts` scoring:
  `effectiveOutput = netOutput × P(fill) − reQuoteCostIfFailed`, plus an ETA per route.
  Direct-fill venues (Genius, Saturn) get latency credit. Opus designs the scoring
  function; Haiku implements with fixture tests. **No other Cardano aggregator does this
  — it is headline feature #1.**

### 2.3 Hardening
- **T2.8 [HAIKU] Quote-vs-actual accuracy telemetry.** Record quoted vs received for every
  fill; publish rolling accuracy stats. (Marketing ammunition + regression alarm.)
- **T2.9 [OPUS] Security review pass.** Threat-model the order builders (datum
  malleability, refund-address correctness, min-receive bound enforcement, deadline
  handling, double-satisfaction across split orders). Produce checklist in
  `docs/decisions/security-phase2.md`. Human commissions external audit before mainnet.
- **T2.10 [HAIKU] Mainnet canary mode.** Behind existing mainnet lock: allow-listed
  wallets only, per-tx cap (e.g. 100 ADA), kill switch. Unlock criteria documented.

### Gate 2
≥50 successful preprod fills across ≥4 protocols; settlement tracker correctly classifies
≥95% of order outcomes; security checklist clean; canary plan approved by human.

---

## Phase 3 — Differentiate & distribute (the actual product)

**Goal:** Ship the three wedge features and the wallet API. ~4–6 weeks.

- **T3.1 [HAIKU] Radical fee transparency (G1).** Every quote shows: DEX fee, batcher
  fee, network fee, min-ADA, **our fee (explicit line)**, and the surplus policy
  ("positive slippage returned to you"). Publish a public `docs/FEES.md` policy page.
  Most of the `FeeBreakdown` plumbing already exists — this is UI + policy work.
- **T3.2 [HAIKU] Settlement UX (G2).** Per-route ETA badge (from T2.6 telemetry), live
  order progress (from T2.5), stuck-order auto-retry/cancel buttons, per-DEX health page.
- **T3.3 [OPUS then HAIKU] Public Aggregator API v1 (G3 — the product).** Opus designs the
  API surface (quote, build-tx returning unsigned CBOR, order-status, health; versioned;
  API-key + rate limits; partner fee-share parameter mirroring DexHunter/Minswap partner
  models). Haiku implements it as a proper Node service (successor to `server.mjs`),
  writes OpenAPI spec + docs site + TypeScript client SDK + status page. Acceptance: a
  third party can integrate a swap with only the docs.
- **T3.4 [HAIKU] Benchmark publication.** Automate T1.10 daily; publish live
  "us vs DexHunter vs SteelSwap" scoreboard. Transparency as marketing.
- **T3.5 [OPUS + human] Wallet BD kit.** One-pager + rev-share proposal targeting Lace
  (publicly multi-provider, currently SteelSwap) and Eternl (SteelSwap single-maintainer
  risk). Opus drafts; human sends. Not a coding task — listed because it gates
  distribution. Also consider a Project Catalyst funding proposal (SteelSwap, DexHunter,
  and Dexter/Iris all funded this way).
- **T3.6 [HAIKU] Coverage expansion.** Splash weighted/stable/TLB pools, MuesliSwap book
  aggregation, non-ADA pair routing (gap G5), stable-pair routing optimization.

### Gate 3
API v1 live with docs + status page; ≥1 wallet/dApp integration conversation in progress;
benchmark scoreboard public; fee policy published.

---

## Phase 4 — Monetize & operate

**Goal:** Turn on revenue, scale infra. ~3–4 weeks, overlaps Phase 3.

- **T4.1 [HAIKU] Fee switch.** Populate `aggregatorFeeAda`/bps in order building (0 for
  MVP marketing if desired; infrastructure ready for 0.1–0.3%). Always displayed (T3.1).
- **T4.2 [HAIKU] Positive-slippage handling.** Where fills land better than min-receive,
  measure surplus; policy: return to user (differentiator) or disclosed split. Implement
  measurement first; the policy itself is a human decision recorded in
  `docs/decisions/surplus.md`.
- **T4.3 [HAIKU] API tiers.** Free (rate-limited) / partner (rev-share) / paid. Usage
  metering + keys. Payment integration only when there's a paying customer — skip until
  then.
- **T4.4 [HAIKU] Infra scale stage.** Stand up the Hetzner node + Ogmios + Kupo stack
  (Mithril bootstrap; Kupo patterns = our DEX script addresses), dual-submit, mempool
  watch via Ogmios LocalTxMonitor (avoid quoting against already-spent pool UTxOs).
  Managed providers demoted to fallback. Runbook in `docs/runbooks/`.
- **T4.5 [OPUS] Mainnet GA decision.** External audit done, canary stats clean, kill
  switch tested → recommend unlock to human.

### Gate 4
Mainnet GA. Revenue plumbing live. Two independent data paths (own node + managed).

---

## Phase 5 — Moonshot: intent layer ("Cardano Fusion") — gap G4

**Goal:** The durable moat. Only start after Gate 4; re-validate market first.
**This phase needs a Plutus/Aiken engineer (human or specialist agent) — not Haiku work.**

- **T5.1 [OPUS] Design doc.** DEX-agnostic order validator: user locks funds with a
  **slot-based decaying min-price** (Dutch auction via validity intervals — the exact
  eUTXO analog of 1inch Fusion); any registered solver may fill against any liquidity;
  solver pays fees, profits from spread; surplus split user/solver/protocol enforced
  on-chain. Reference: geniusyield/smart-order-router proves permissionless filling works
  on Cardano. Cardano-specific MEV note: no gas auctions — the batcher/solver IS the MEV
  actor, so solver registration + staking/slashing is the fairness mechanism.
- **T5.2 [human/specialist] Aiken validator + external audit.**
- **T5.3 [HAIKU] Solver reference implementation** (TypeScript, fills intents using our
  router's liquidity access) + solver onboarding docs — an open solver market is the
  point.
- **T5.4 Integration:** intents become a route class in the ranking engine ("patient
  mode": better price, bounded wait).

---

## Standing risks (Opus: re-check at every gate)

1. **Cardano DeFi volume is small** (TVL ~$132M mid-2026; market leader does ~$230K/day).
   Revenue ceiling is low near-term; the bet is positioning for a recovery + being
   acquisition-grade infra. Keep burn near zero (infra <$100/mo until Phase 4).
2. **Quote drift / fill risk** on batcher DEXes — never promise exact output; promise
   min-receive + measured accuracy stats (T2.8 protects credibility).
3. **Upstream datum changes** (DEX upgrades) — fixture tests + per-protocol health checks
   catch breakage; watch protocol repos' releases.
4. **Dexter/Iris maintenance risk** — Catalyst-funded and active as of 2026, but the T1.3
   decision must keep our protocol modules swappable.
5. **DexHunter response** — they can copy transparency features; they cannot easily copy
   *published* benchmarks and a surplus-return policy without cannibalizing hidden
   revenue. Speed on G1/G2/G3 matters more than feature breadth.
