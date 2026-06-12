# ClearRoute Unified Implementation Roadmap v2

**Date**: June 12, 2026  
**Source**: 130-finding audit + 11 levels of deep research (25 strategic decisions)  
**Status**: Plan only — no implementation has begun

---

## Executive Summary

ClearRoute is a Cardano DEX aggregator (7 live adapters, 2 direct-pool AMM adapters, CIP-30 wallet, React UI). An audit found **130 findings** including 6 CRITICAL bugs. Research produced **25 strategic decisions**.

This roadmap provides: a **Minimum Viable Path** for fastest production-readiness, a **full 8-phase plan** with intra-phase ordering and rollback strategies, T-shirt sizing for every fix, a **danger zone** analysis isolating fund-loss bugs, and a **file-level dependency graph** for parallel development.

### Quick Reference

| What | Where |
|------|-------|
| Fastest path to production | [Minimum Viable Path](#minimum-viable-path-mvp) |
| Bugs that could lose user funds | [Danger Zone](#danger-zone-analysis) |
| What to build first in each phase | [Intra-Phase Ordering](#intra-phase-ordering-summary) |
| How to undo if something breaks | [Rollback Strategy per Phase](#rollback-strategy-per-phase) |
| Which tests catch the most bugs | [Test Impact Analysis](#test-impact-analysis--roi) |
| File-level dependencies for parallel dev | [File-Level Dependency Graph](#file-level-dependency-graph) |
| Completed work checklist | [Universal Definition of Done](#universal-definition-of-done) |

### Success Criteria

1. `npm run build` passes with zero TypeScript errors
2. All 81 existing + new tests achieve 85%+ branch coverage
3. CI pipeline is green (build → test → lint → coverage → accessibility → bundle-size)
4. All 6 CRITICAL and 8 HIGH audit findings resolved
5. No known race conditions, memory leaks, or concurrency bugs
6. Mainnet execution locked at network level
7. WCAG 2.1 AA accessibility baseline
8. Bundle reduced from ~255KB to ≤160KB (enforced by CI)

---

## Minimum Viable Path (MVP)

If you need production-readiness in **the shortest possible time**, run this subset. Everything else is deferred to post-launch.

### MVP Phase A: Fix Fund-Loss Bugs (4-5 hours)

| Fix | Size | What |
|-----|------|------|
| PROTO-1 | M | Lovelace decimal scaling — ADA amounts wrong by 10⁶× |
| BUG-1 | S | Price impact argument mismatch |
| BUG-3 + NUM-4 | M | Unify net-output calculation |
| NUM-2 | S | Live price for fee conversion |
| cborg parser (D3) | M | Replace custom CBOR parser |

**Gate**: `npm run build` passes, direct-pool adapters produce correct outputs.

### MVP Phase B: Prevent Double-Spend + Race Conditions (3-4 hours)

| Fix | Size | What |
|-----|------|------|
| RACE-1 (D1 partial) | M | `isExecutingRef` guard on swap button |
| RACE-2 (D20 partial) | S | AbortController in fetch layer |
| RISK-2 | S | Mainnet execution lock |
| LEAK-1 | S | setTimeout cleanup |

**Gate**: Double-click does not trigger concurrent execution. Mainnet locked.

### MVP Phase C: Test Critical Math (3-4 hours)

| Fix | Size | What |
|-----|------|------|
| TG-5 | S | Fix weak price impact test |
| amm.property.test.ts (D4) | M | 6 AMM invariants with fast-check |
| TG-1 | M | minswapBuildTx tests |
| TG-3 | M | Direct-pool adapter error path tests |

**Gate**: AMM invariants verified. 80%+ coverage on critical math.

### MVP Phase D: Wallet Protocol Fixes (2-3 hours)

| Fix | Size | What |
|-----|------|------|
| CIP30-1 + PROTO-2 | S | `partialSign: true` |
| PROTO-3 | S | Reject unknown network IDs |
| PROTO-4 | S | CBOR empty string guard |
| NUM-1 | S | Bigint precision guard |

**Gate**: CIP-30 compliant. No protocol parameter errors.

### MVP Total: 13-16 hours

**What's deferred**: React Query, useReducer, BaseDexAdapter, code splitting, PWA, accessibility, mobile, telemetry, E2E tests, Stryker, Lighthouse CI, API proxy, session persistence, slippage UX, fee estimation, multi-network.

These are all valuable but not blocking for a secure initial release. They can be implemented incrementally post-launch.

---

## Danger Zone Analysis

These bugs directly risk **user fund loss** or **incorrect financial computation**. Fix them first in every phase.

| 🔴 Rank | ID | Fund-Loss Mechanism | Phase | Size |
|--------|----|--------------------|-------|------|
| 1 | PROTO-1 | ADA decimal scaling wrong: 5 ADA treated as 5 lovelace → swap output off by 10⁶× | 0 | M |
| 2 | RACE-1 | Double-click submits swap twice → user charged 2× | 2 | M |
| 3 | RACE-2 | Stale quote overwrites fresh → user signs at wrong price | 2 | S |
| 4 | BUG-3 | Net-output formula mismatch → user sees incorrect expected output | 1 | M |
| 5 | RISK-2 | Mainnet execution not locked → user could accidentally execute real swaps | 2 | S |
| 6 | TG-5 | Weak price impact test → AMM math bugs pass undetected | 3 | S |
| 7 | CIP30-1 | `partialSign: false` on DEX contracts → wallet may reject or sign incorrectly | 6 | S |
| 8 | NUM-1 | Bigint→Number overflow → balance display wrong, user overestimates holdings | 6 | S |

---

## Bundle Size Enforcement

Bundle targets are aspirational without CI enforcement. Add to `.github/workflows/ci.yml`:

```yaml
- name: Bundle size check
  run: npx vite build
- name: Size limit
  run: |
    npm install -D @size-limit/preset-app
    npx size-limit
```

Add to `package.json`:

```json
"size-limit": [
  { "path": "dist/assets/*.js", "limit": "160 KB", "gzip": true },
  { "path": "dist/assets/*.css", "limit": "20 KB", "gzip": true }
]
```

**Evolution tracked and enforced**:

| Phase | Target | Enforced By |
|-------|--------|-------------|
| 0 | ≤270KB | size-limit CI |
| 2 | ≤265KB | size-limit CI |
| 5 | ≤160KB | size-limit CI + manualChunks |
| 7 | ≤145KB | size-limit CI + icon tree-shaking |

---

## Master Dependency Graph

```
                           ┌──────────────────────┐
                           │    Phase 0: Build     │
                           │   Unblock (2-3 hrs)   │
                           └──────────┬───────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│  Phase 1: Data       │ │ Phase 2: Runtime     │ │ Phase 6: Protocol    │
│  Integrity (2-3 hrs) │ │ Safety (4-6 hrs)     │ │ & Wallet (3-4 hrs)   │
└──────────┬───────────┘ └──────────┬───────────┘ └──────────┬───────────┘
           │              ┌─────────┴─────────┐              │
           ▼              ▼                   ▼              │
┌──────────────────────┐ ┌──────────────────────┐           │
│  Phase 3: Tests      │ │ Phase 4: UX & Perf   │           │
│  (4-6 hrs)           │ │ (2-3 hrs)            │           │
└──────────┬───────────┘ └──────────┬───────────┘           │
           └───────────┬────────────┘                        │
                       ▼                                     │
          ┌──────────────────────┐                           │
          │ Phase 5: Quality     │◄──────────────────────────┘
          │ (4-6 hrs)            │
          └──────────┬───────────┘
                     ▼
          ┌──────────────────────┐
          │ Phase 7: Polish      │
          │ (3-4 hrs)            │
          └──────────────────────┘
```

---

## File-Level Dependency Graph

This shows which files create **merge conflicts or sequential bottlenecks** during parallel development.

```
src/main.tsx ─────────────────────────────────────────────────────────────────
  │  (every phase touches this file)
  │
  ├── Phase 0: src/wallet/cip30.ts (isolated — no conflicts)
  ├── Phase 0: src/adapters/fetchUtils.ts (isolated)
  │
  ├── Phase 1: src/domain/aggregator.ts + src/domain/quoteEngine.ts
  │     └── CONFLICT: Both Phase 1 and Phase 2 touch quoteEngine.ts
  │         RESOLVE: Phase 1 does BUG-3/NUM-4 first, Phase 2 adds useMemo wrappers after
  │
  ├── Phase 2: src/hooks/ (11 new files — all isolated, no conflicts)
  │     ├── useSwapExecution.ts ─── depends on executionMachine.ts (D1)
  │     ├── useLiveQuotes.ts ────── depends on @tanstack/react-query (D2)
  │     ├── useWalletReconnect.ts ─ isolated (D19)
  │     ├── usePreferences.ts ───── isolated (D19)
  │     ├── useTxPersistence.ts ─── isolated (D19,6)
  │     ├── useTabVisibility.ts ─── isolated (D19)
  │     ├── useSafeAsync.ts ─────── isolated (D20)
  │     └── useDebouncedValue.ts ── isolated (D20)
  │
  ├── Phase 3: test/ + src/domain/*.property.test.ts (isolated — test files)
  │
  ├── Phase 4: src/domain/slippage.ts (isolated)
  │
  ├── Phase 5: src/adapters/baseAdapter.ts
  │     └── BOTTLENECK: All 7 adapters must be refactored to extend BaseDexAdapter
  │         ORDER: baseAdapter.ts first → refactor adapters one-by-one (not in parallel)
  │         CONFLICT: If Phase 0 changed fetchUtils.ts, adapters must use new signature
  │
  ├── Phase 5: src/workers/routeWorker.ts
  │     └── CONFLICT: D14 (Web Worker) imports from src/domain/quoteEngine.ts
  │         If Phase 1 changed decideRoutes, worker must be updated
  │         RESOLVE: Implement D14 AFTER Phase 1 changes to quoteEngine.ts stabilize
  │
  ├── Phase 6: src/config/networkConfig.ts (isolated)
  ├── Phase 6: src/domain/utxoCheck.ts (isolated)
  │
  └── Phase 7: src/styles.css, public/ (isolated — CSS/static files)
```

### Architectural Conflict: D8 (Dynamic Loading) vs D14 (Web Worker)

**Problem**: D8 uses `import()` to code-split adapters. D14 moves `decideRoutes` + `computeOptimalSplit` to a Web Worker. If the Worker tries to `import()` an adapter module, it creates a complex Vite bundling scenario.

**Resolution**: The Web Worker only imports pure domain functions (`decideRoutes`, `constantProductSwap`, `computeOptimalSplit`). It does NOT import adapters. Adapters stay in the main thread. This keeps the Worker stateless and bundler-friendly.

**Implementation order**: D8 (dynamic imports) → D14 (Worker). The Worker references already-split modules.

### Architectural Conflict: D1 (useReducer), D2 (React Query), D19 (Session Persistence) State Overlap

**Problem**: Three decisions all manage swap-related state. useReducer manages execution state. React Query manages quote data. Session persistence manages localStorage tx tracking. They must not conflict.

**Resolution**: 
- **D1 (useReducer)**: Owns "what step are we on?" — pure execution machine. No data fetching.
- **D2 (React Query)**: Owns "what quotes do we have?" — pure data layer. No UI state.
- **D19 (Session)**: Owns "what happened before this page load?" — pure persistence. Read-only during execution.

Clear boundaries: Reducer dispatches actions. React Query provides data to the reducer. Session reads/writes localStorage only at connect/disconnect/tx-submit boundaries.

---

## Universal Definition of Done

Every individual fix must satisfy this checklist before being marked complete. Phase gates are the sum of their fix-level DoDs.

### Per-Fix DoD Checklist

- [ ] **Code written**: Implementation matches the plan (see code patterns in `docs/DEEP-RESEARCH-ADDENDUM.md` or `docs/IMPLEMENTATION-PLAN.md`)
- [ ] **TypeScript**: `npx tsc --noEmit` shows 0 errors in affected files
- [ ] **Existing tests**: `npm test` — all 81 existing tests still pass
- [ ] **New tests** (if applicable): Tests written for the fix (see Test Impact Analysis for priority)
- [ ] **Lint**: `npm run lint` shows 0 warnings (after Phase 5)
- [ ] **Manual QA**: For UI changes, verify in browser at `http://localhost:5173`
- [ ] **Code review**: PR reviewed (or code-reviewer-deepseek agent if solo)
- [ ] **Documentation**: JSDoc added for any new exported functions
- [ ] **Git**: Atomic commit with descriptive message referencing audit ID (e.g., `fix: PROTO-1 lovelace decimal scaling`)

### Per-Phase DoD Checklist (in addition to per-fix)

- [ ] **All fixes in phase**: Every fix in the phase meets per-fix DoD
- [ ] **Rollback validated**: Rollback strategy tested (e.g., `git revert` produces clean state)
- [ ] **Gate check**: All gate check items for the phase pass
- [ ] **Bundle check**: `npx size-limit` passes (after Phase 5)
- [ ] **No regressions**: Full test suite passes, no new warnings

---

## Test Impact Analysis / ROI

Not all tests are equal. These tests catch the most bugs per test written.

### Highest ROI Tests (write these FIRST)

| Priority | Test | Catches | Effort | Bugs Prevented |
|----------|------|---------|--------|----------------|
| 🔴 1 | `amm.property.test.ts` — k-invariant | AMM math errors (BUG-1, BUG-3 class) | 30 min | 2 CRITICAL + all future AMM changes |
| 🔴 2 | `amm.property.test.ts` — allocation-sum | Optimal-split errors (NUM-4 class) | 20 min | 1 HIGH + regression safety |
| 🔴 3 | Direct-pool adapter tests (TG-3) | PROTO-1 regression, zero-reserve crash | 1 hr | 1 CRITICAL + edge cases |
| 🟡 4 | `quoteEngine.property.test.ts` — no self-rejection | Route selection logic errors | 30 min | CC-1 refactoring safety |
| 🟡 5 | `minswapBuildTx.test.ts` (TG-1) | Build/submit tx error handling | 1 hr | Production tx reliability |
| 🟢 6 | E2E swap-flow.test.ts (D9) | Full integration gaps | 2 hr | End-to-end regression safety |
| 🟢 7 | Steelswap/Cardexscan/Saturn tests (TG-4) | Normalization edge cases | 2 hr | Adapter-specific data bugs |

### Coverage Targets by Risk Zone

| Zone | Files | Target |
|------|-------|--------|
| 🔴 Fund-loss zone | `amm.ts`, `quoteEngine.ts`, direct-pool adapters | 95% branch |
| 🟡 Execution zone | `transactions.ts`, `txTracker.ts`, `aggregator.ts` | 85% branch |
| 🟢 UX zone | `main.tsx`, components, hooks | 70% branch |

---

## Decision Summary: All 25 Decisions

| # | Decision | Phase | Category | Size | Bundle |
|---|----------|-------|----------|------|--------|
| D1 | useReducer pipeline state machine | 2 | Architecture | L | 0 KB |
| D2 | React Query for live quotes | 2 | Data | L | +12-15 KB |
| D3 | cborg CBOR parser | 0 | Security | M | +8 KB |
| D4 | fast-check property testing | 3 | Testing | M | +8 KB (dev) |
| D5 | No CSL/MeshJS (REST only) | — | Architecture | — | 0 (saves 2MB) |
| D6 | Error recovery UX | 4 | UX | M | 0 KB |
| D7 | BaseDexAdapter (Template Method) | 5 | Architecture | L | -20 KB |
| D8 | Dynamic adapter loading | 5 | Performance | L | -95 KB |
| D9 | E2E with mock CIP-30 wallet | 3 | Testing | M | 0 KB (dev) |
| D10 | Observability & telemetry | 5 | Operations | M | +2 KB |
| D11 | PWA (app shell + offline) | 7 | UX | S | +2 KB |
| D12 | Multi-network architecture | 6 | Architecture | M | +1 KB |
| D13 | Performance budgets (Lighthouse CI) | 5 | Operations | S | 0 KB |
| D14 | Web Worker offloading | 5 | Performance | M | +5 KB |
| D15 | Accessibility (ARIA + axe-core) | 7 | UX | M | +1 KB |
| D16 | API key security via proxy | 5 | Security | L | 0 KB (server) |
| D17 | Graceful degradation | 2 | Resilience | M | +2 KB |
| D18 | UTXO selection awareness | 6 | Protocol | S | +1 KB |
| D19 | Session persistence & reconnect | 2 | UX | L | +2 KB |
| D20 | Concurrency safety | 2 | Reliability | M | +1 KB |
| D21 | Mobile-responsive design | 7 | UX | L | +3 KB |
| D22 | Fee optimization & transparency | 1 | Protocol | S | +1 KB |
| D23 | Slippage protection UX | 4 | UX | L | +3 KB |
| D24 | Datum construction awareness | 6 | Architecture | XS | 0 KB (docs) |
| D25 | Token metadata management | 7+ | Data | L | +5 KB (future) |

---

## T-Shirt Sizing Reference

| Size | Meaning | Typical Scope |
|------|---------|---------------|
| XS | ≤15 min | One-line change, comment, or config value |
| S | 15-45 min | Single file, localized change |
| M | 45 min-2 hr | Multi-file coordinated change |
| L | 2-4 hr | New file + integration + tests |
| XL | 4+ hr | Cross-cutting architecture (none in this plan — broken into smaller pieces) |

---

## Phase 0: Build Unblock (2-3 hours, 4 fixes)

**Priority**: CRITICAL — Must complete first.  
**Gate**: `npm run build` passes, `tsc --noEmit` clean, all 81 existing tests pass.  
**Decisions**: D3

### Intra-Phase Ordering

```
Step 1 (S): BUG-4 — Deduplicate fetchWithTimeout
           ↓ Why first: Isolated cleanup, no logic change, warms up the codebase
Step 2 (S): BUG-1 — Fix price impact argument mismatch
           ↓ Updates adapter files just cleaned up in Step 1
Step 3 (M): PROTO-1 — Fix lovelace decimal scaling
           ↓ Changes the same adapter files — do after Steps 1-2 stabilize
Step 4 (M): D3 — Replace CborReader with cborg
           ↓ Isolated to cip30.ts, can run independently, but do last as it's a new dep
```

### Bug Fixes

| # | Step | ID | Size | Files | Fix |
|---|------|----|------|-------|-----|
| 1 | 1 | BUG-4 | S | 9 adapter files | Import `fetchWithTimeout`/`asNumber` from `fetchUtils.ts` |
| 2 | 2 | BUG-1 | S | `minswapV2DirectPoolAdapter.ts:98`, `sundaeSwapV3DirectPoolAdapter.ts:113`, `amm.test.ts:40,44` | Pass `reserveIn` as 2nd arg |
| 3 | 3 | PROTO-1 | M | `minswapV2DirectPoolAdapter.ts:86`, `sundaeSwapV3DirectPoolAdapter.ts:105` | Remove lovelace special case — always `10 ** decimals` |
| 4 | 4 | D3 | M | `src/wallet/cip30.ts` | `npm install cborg`, delete `class CborReader`, rewrite `parseBalanceCbor` |

### Rollback Strategy

- **BUG-1**: `git revert` single commit. No cascading effects.
- **PROTO-1**: Revert changes to both adapters. Mock adapter tests verify no regression.
- **BUG-4**: If import breaks an adapter, revert that adapter only. Others stay deduplicated.
- **D3**: Revert cip30.ts changes + `npm uninstall cborg`. Backup: original CborReader is in git history.

### Gate Check
- [ ] `npm run build` exits 0
- [ ] `npx tsc --noEmit` shows 0 errors
- [ ] `npm test` — all 81 existing tests pass
- [ ] Direct-pool adapter: 1,000 ADA → ~460K SNEK (not ~0.46)

---

## Phase 1: Data Integrity (2-3 hours, 4 fixes + D22)

**Priority**: HIGH  
**Gate**: All net-output paths produce identical results for same inputs.  
**Decisions**: D22

### Intra-Phase Ordering

```
Step 1 (M): BUG-3 + NUM-4 — Extract shared computeNetOutput function
           ↓ Foundation — all other Phase 1 fixes depend on this
Step 2 (S): CQ-1 — Verify formula consistency
           ↓ Validation step after Step 1
Step 3 (S): NUM-2 — Live price for fee conversion in quoteEngine
           ↓ Changes quoteEngine.ts which Step 1 also touched
Step 4 (S): GAS-2 + GAS-3 — Rename depositAda → minAdaRequirement
           ↓ Cosmetic — safe to do last
Step 5 (S): D22 — Fee estimation utility
           ↓ New file, no conflicts, depends on Step 1's fee refactoring
```

### Bug Fixes

| # | Step | ID | Size | Files | Fix |
|---|------|----|------|-------|-----|
| 1 | 1 | BUG-3 + NUM-4 | M | `aggregator.ts:49,60`, `quoteEngine.ts:27` | Extract shared `computeNetOutput()`, use `inputAsset.mockPriceAda` |
| 2 | 2 | CQ-1 | S | `aggregator.ts` | Verify unified formula matches `netOutputForCandidate` |
| 3 | 3 | NUM-2 | S | `quoteEngine.ts:32` | Use `grossOutput / amountIn` for live quotes |
| 4 | 4 | GAS-2/3 | S | All adapters, `fees.ts` | Rename `depositAda` → `minAdaRequirement` |

### Strategic: D22 — Fee Estimation (Step 5)

New file `src/domain/feeEstimation.ts` with `estimateSwapFee()`, `formatFeeEstimate()`, `compareRouteFees()`.

### Rollback Strategy

- **BUG-3/NUM-4 unification**: Revert shared function extraction. Old per-file functions are preserved during extraction — delete the shared function and uncomment originals.
- **D22**: Revert new file. No other code depends on it.

### New Files
- `src/domain/feeEstimation.ts`

### Gate Check
- [ ] Identical net-output from both paths for same inputs
- [ ] Non-ADA input assets produce correct net output
- [ ] `depositAda` renamed globally

---

## Phase 2: Runtime Safety + Architecture Modernization (4-6 hours, 5 decisions)

**Priority**: HIGH — Largest architectural win.  
**Gate**: No race conditions, mainnet locked, error boundaries active.  
**Decisions**: D1, D2, D17, D19, D20  
**Dependencies**: `npm install @tanstack/react-query`

### ⚠️ HIGH-RISK PHASE — Read Rollback Strategy Before Starting

This phase rewrites the swap execution engine and data fetching layer. It touches the most lines and has the highest regression risk. **Create a git branch. Commit after each decision.**

### Intra-Phase Ordering

```
Step 1 (L): D1 — Create executionMachine.ts + useSwapExecution.ts
           ↓ Foundation — all swap logic depends on this
Step 2 (L): D2 — Install React Query + create useLiveQuotes.ts
           ↓ Data layer — depends on new state machine for integration points
Step 3 (M): D20 — Concurrency safety utilities (useSafeAsync, useDebouncedValue, fetchUtils update)
           ↓ Safety net — protects Steps 1-2 from race conditions
Step 4 (L): D19 — Session persistence (useWalletReconnect, usePreferences, useTxPersistence, useTabVisibility)
           ↓ UX layer — depends on React Query and new state machine
Step 5 (M): D17 — Graceful degradation (ErrorBoundary, NetworkStatus)
           ↓ Safety net — wraps all of the above
Step 6 (L): main.tsx refactoring — Wire everything together
           ↓ Integration — reduces main.tsx from ~600 to ~250 lines
```

### Decisions

| # | Step | ID | Size | New Files |
|---|------|----|------|-----------|
| 1 | 1 | D1 | L | `src/domain/executionMachine.ts`, `src/hooks/useSwapExecution.ts` |
| 2 | 2 | D2 | L | `src/hooks/useLiveQuotes.ts` |
| 3 | 3 | D20 | M | `src/hooks/useSafeAsync.ts`, `src/hooks/useDebouncedValue.ts` |
| 4 | 4 | D19 | L | `src/hooks/useWalletReconnect.ts`, `src/hooks/usePreferences.ts`, `src/hooks/useTxPersistence.ts`, `src/hooks/useTabVisibility.ts` |
| 5 | 5 | D17 | M | `src/components/ErrorBoundary.tsx`, `src/components/NetworkStatus.tsx` |
| 6 | 6 | — | L | `src/main.tsx` (heavily modified), `src/main.integration.test.ts` |

### State Ownership Boundaries

| State | Owner | Consumers |
|-------|-------|-----------|
| Swap execution step | `useReducer` (D1) | main.tsx button text, error display |
| Live quote data | React Query (D2) | useReducer effect handlers, route decision |
| Wallet identity | localStorage (D19) | useWalletReconnect, usePreferences |
| Pending transactions | localStorage (D19) | useTxPersistence, txTracker |
| User preferences | localStorage (D19) | SlippageSettings, token selectors |
| Adapter health | Telemetry (D10) | NetworkStatus banner |

### Bug Fixes

| ID | Description | Fixed By |
|----|-------------|----------|
| RACE-1 | Double-click submission | D1 `isExecutingRef` + D20 |
| RACE-2 | Stale quote overwrites | D2 React Query auto-abort |
| LEAK-1 | setTimeout leak | Cleanup in effect |
| RISK-2 | Mainnet lock bypass | Network-level check |
| RISK-3 | Uncaught error crash | D17 ErrorBoundary |

### Rollback Strategy

- **ON MERGE CONFLICT OR TEST FAILURE**: Revert the merge commit. Do not attempt to fix forward.
- **Individual decision rollback**: Each decision has its own commit. Revert the specific commit.
- **Worst case**: `git reset --hard HEAD~6` reverts the entire phase. All decisions are additive (new files + main.tsx modifications). No other phases modify the same files.
- **Validation before proceeding**: `npm run build` + `npm test` must pass before moving to Phase 3.

### Gate Check
- [ ] Double-click does not trigger concurrent execution
- [ ] Changing token pair aborts in-flight quote fetches
- [ ] Wallet silently reconnects on page refresh
- [ ] Mainnet execution blocked at network level
- [ ] Error boundary catches throws
- [ ] "Retry swap" works from all terminal states
- [ ] main.tsx reduced to ~250 lines

---

## Phase 3: Test Coverage (4-6 hours, 2 decisions + 5 test gaps)

**Priority**: HIGH  
**Gate**: 85%+ branch coverage, 6 AMM invariants verified.  
**Decisions**: D4, D9

### Intra-Phase Ordering

```
Step 1 (M): D4 — Write amm.property.test.ts (6 invariants)
           ↓ Highest ROI tests — catches AMM math bugs immediately
Step 2 (S): TG-5 — Fix weak price impact test
           ↓ Validates Step 1's BUG-1 fix
Step 3 (M): TG-3 — Direct-pool adapter tests
           ↓ Validates Phase 0's PROTO-1 fix
Step 4 (M): TG-1 — minswapBuildTx tests
           ↓ Validates transaction building layer
Step 5 (M): D4 continued — quoteEngine.property.test.ts
           ↓ Validates Phase 1's BUG-3/NUM-4 unification
Step 6 (M): TG-4 — Steelswap, Cardexscan, SaturnSwap tests
           ↓ Coverage gap fill
Step 7 (M): D9 — E2E with mock wallet
           ↓ Integration safety net
Step 8 (M): Stryker mutation testing
           ↓ Validates ALL test quality
```

### Test Impact by Priority

| Step | Test | Effort | Catches |
|------|------|--------|---------|
| 1 | `amm.property.test.ts` (6 invariants) | 30 min | BUG-1, BUG-3, future AMM changes |
| 2 | Fix weak price impact test | 15 min | BUG-1 regression |
| 3 | Direct-pool adapter tests | 1 hr | PROTO-1 regression, edge cases |
| 4 | `minswapBuildTx` tests | 1 hr | Production tx reliability |
| 5 | `quoteEngine.property.test.ts` | 30 min | CC-1 refactoring safety |
| 6 | Adapter normalization tests | 2 hr | Adapter-specific data bugs |
| 7 | E2E swap flow | 2 hr | End-to-end regression safety |
| 8 | Stryker | 30 min | Test quality validation |

### New Files
- `test/arbitraries.ts`
- `src/domain/amm.property.test.ts`
- `src/domain/quoteEngine.property.test.ts`
- `e2e/swap-flow.test.ts`
- `stryker.config.json`
- `src/adapters/minswapBuildTx.test.ts` (updated)
- `src/adapters/minswapV2DirectPoolAdapter.test.ts`
- `src/adapters/sundaeSwapV3DirectPoolAdapter.test.ts`

### Rollback Strategy
- Tests are additive. No rollback needed — failing tests are debugged, not reverted.
- Stryker is dev-only. If config breaks CI, remove the CI step (not the tests).

### Gate Check
- [ ] `npm test` passes with 85%+ branch coverage
- [ ] No files below 80% lines
- [ ] 6 AMM invariants verified
- [ ] E2E happy path passes
- [ ] Stryker score ≥ 70%

---

## Phase 4: UX & Performance (2-3 hours, 2 decisions)

**Priority**: MEDIUM  
**Gate**: Slippage controls functional, retry works, errors human-readable.  
**Decisions**: D6, D23

### Intra-Phase Ordering

```
Step 1 (L): D23 — Create slippage.ts + SlippageSettings.tsx
           ↓ New files, no conflicts with existing code
Step 2 (M): D6 — Error recovery UX (ERROR_LABELS, keep inputs, auto-refresh)
           ↓ Modifies main.tsx error display paths
Step 3 (S): PERF-1/2 — useMemo wrappers
           ↓ Quick optimization after Steps 1-2 change render patterns
```

### Bug Fixes

| ID | Size | Fix |
|----|------|-----|
| PERF-1/2 | S | Wrap `buildDecision`, `createTransactionPreview`, `computeAdapterHealth` in `useMemo` |
| SM-1 | — | Already fixed by D1 RESET action |
| SM-2 | — | Already fixed by D1 pipeline separation |

### New Files
- `src/domain/slippage.ts`
- `src/components/SlippageSettings.tsx`

### Rollback Strategy
- D23: Revert new files. Slippage default is hardcoded at 0.5% (current behavior).
- D6: Revert ERROR_LABELS map. Raw error messages still display (current behavior).

### Gate Check
- [ ] Slippage presets change `minAmountOut` display
- [ ] Price impact warning above 1%
- [ ] Error messages are human-readable
- [ ] No unnecessary re-renders from route calculation

---

## Phase 5: Code Quality & Infrastructure (4-6 hours, 6 decisions)

**Priority**: MEDIUM  
**Gate**: CI green, all adapters standardized, bundle split, API keys proxied.  
**Decisions**: D7, D8, D10, D13, D14, D16

### ⚠️ CONFLICT WARNING: D7 refactors ALL 7 adapters. Coordinate with any parallel work.

### Intra-Phase Ordering

```
Step 1 (L): D7 — Create baseAdapter.ts
           ↓ Foundation — all adapters depend on this
Step 2 (L): D7 continued — Refactor adapters ONE AT A TIME
           ↓ minswapLive → dexHunter → steelswap → cardexscan → saturnSwap → minswapV2Direct → sundaeSwapV3Direct
           ↓ Run npm test after EACH adapter
Step 3 (L): D8 — Dynamic adapter loading
           ↓ Depends on D7 completed (adapters must be refactored first)
Step 4 (M): D10 — Telemetry (new file, wire into BaseDexAdapter)
           ↓ Depends on D7 (BaseDexAdapter exists)
Step 5 (M): D14 — Web Worker for route ranking
           ↓ Depends on D8 (modules are already code-split)
           ↓ See Architectural Conflict note: Worker only imports domain functions, NOT adapters
Step 6 (L): D16 — API proxy (vite.config.ts + api/proxy.ts)
           ↓ Depends on D7 (adapters must use fetchWithTimeout from baseAdapter)
Step 7 (S): D13 — Lighthouse CI + eslint config + CI fixes
           ↓ Validation — runs AFTER all code changes
```

### Decisions

| # | Step | ID | Size | New Files |
|---|------|----|------|-----------|
| 1 | 1-2 | D7 | L | `src/adapters/baseAdapter.ts` |
| 2 | 3 | D8 | L | `vite.config.ts` updated |
| 3 | 4 | D10 | M | `src/telemetry/logger.ts` |
| 4 | 5 | D14 | M | `src/workers/routeWorker.ts` |
| 5 | 6 | D16 | L | `api/proxy.ts`, `vite.config.ts` updated |
| 6 | 7 | D13 | S | `lighthouserc.js`, `eslint.config.js`, CI updated |

### Rollback Strategy

- **D7 adapter refactoring**: Each adapter refactored in its own commit. Revert individual adapter commits.
- **D8 dynamic loading**: Revert useLiveQuotes.ts changes. Static imports still work.
- **D14 Web Worker**: Revert routeWorker.ts + useRouteDecision changes. Fallback: sync execution always available.
- **D16 proxy**: Revert vite.config.ts changes. API keys exposed in bundle (current behavior — not introducing a new issue).

### Gate Check
- [ ] `npm run build` passes with code-split chunks
- [ ] CI green (build → test → lint → coverage → accessibility → bundle-size)
- [ ] All adapters extend BaseDexAdapter
- [ ] Circuit breaker trips after 3 failures
- [ ] Bundle analyzer shows adapter chunks
- [ ] No VITE_ env vars in browser bundle
- [ ] Lighthouse ≥ 85

---

## Phase 6: Protocol & Wallet Correctness (3-4 hours, 3 decisions + 7 fixes)

**Priority**: MEDIUM  
**Gate**: CIP-30 compliant, UTXO checks active, network handling correct.  
**Decisions**: D12, D18, D24

### Intra-Phase Ordering

```
Step 1 (M): D12 — Create networkConfig.ts + network selector UI
           ↓ Foundation — other Phase 6 fixes reference network config
Step 2 (S): PROTO-3 — Unknown network ID rejection
           ↓ Depends on D12 network model
Step 3 (S): CIP30-1 + PROTO-2 — partialSign fix
           ↓ Isolated wallet change, can run in parallel with Steps 1-2
Step 4 (S): PROTO-4 — CBOR empty string guard
           ↓ Already in cip30.ts from Phase 0 D3 — verify guard exists
Step 5 (S): NUM-1 — Bigint precision guard
           ↓ Isolated main.tsx change
Step 6 (S): D18 — Create utxoCheck.ts (pre-flight balance check)
           ↓ New file, depends on wallet API being stable
Step 7 (S): TK-1 + TK-3 — HOSKY fix + pair gating
           ↓ Asset configuration, no code dependencies
Step 8 (XS): D24 — JSDoc on direct-pool adapters
           ↓ Documentation only, can do anytime
```

### Bug Fixes

| # | Step | ID | Size | Fix |
|---|------|----|------|-----|
| 1 | 1 | D12 | M | Multi-network config + selector |
| 2 | 2 | PROTO-3 | S | Reject unknown network IDs |
| 3 | 3 | CIP30-1 + PROTO-2 | S | `partialSign: true` |
| 4 | 4 | PROTO-4 | S | CBOR empty string guard |
| 5 | 5 | NUM-1 | S | Bigint precision guard |
| 6 | 6 | D18 | S | Pre-flight UTXO check |
| 7 | 7 | TK-1 + TK-3 | S | HOSKY + pair gating |
| 8 | 8 | D24 | XS | Direct-pool adapter JSDoc |

### New Files
- `src/config/networkConfig.ts`
- `src/domain/utxoCheck.ts`

### Rollback Strategy
- **partialSign change**: Revert to `false`. Test against real wallet to confirm no regression.
- **Network config**: Revert to old inline checks. No structural change — just centralized vs scattered.
- **UTXO check**: Remove pre-flight call. Wallet still validates at signTx time.

### Gate Check
- [ ] `partialSign: true` in signTx call
- [ ] Unknown network IDs rejected
- [ ] Pre-flight UTXO check shows warnings
- [ ] HOSKY resolved or removed

---

## Phase 7: Polish & Accessibility (3-4 hours, 4 decisions + cleanup)

**Priority**: LOW  
**Gate**: WCAG 2.1 AA, no dead code, accurate docs.  
**Decisions**: D11, D15, D21, D25 (partial)

### Intra-Phase Ordering

```
Step 1 (M): D15 — Accessibility (Announcer.tsx + useAnnounce hook)
           ↓ Foundation — wire into swap execution first
Step 2 (L): D21 — Mobile-responsive CSS (CSS custom properties + media queries)
           ↓ CSS-only — can run in parallel with Step 1
Step 3 (S): A11Y-1/2/5 — Focus styles, reduced motion, status indicators
           ↓ CSS additions — adds to Step 2's CSS changes
Step 4 (S): D11 — PWA (sw.js + manifest.json)
           ↓ Static files — isolated
Step 5 (M): D25 — Token metadata foundation (behind feature flag)
           ↓ New files, not wired into UI yet
Step 6 (S): DOC-1/2/3 — JSDoc + README fixes
           ↓ Documentation — can run anytime
Step 7 (S): Dead code cleanup + config files
           ↓ Safe last — code removal after everything else stabilizes
```

### New Files
- `src/components/Announcer.tsx`
- `src/services/tokenRegistry.ts`
- `src/hooks/useTokenList.ts`
- `src/components/TokenSelector.tsx`
- `public/sw.js`
- `public/manifest.json`
- `.prettierrc`
- `.editorconfig`

### Rollback Strategy
- All Phase 7 changes are additive or CSS-only. Revert individual commits.
- Accessibility changes don't affect functionality.
- PWA is progressive enhancement — app works without it.

### Gate Check
- [ ] Keyboard navigation shows visible focus indicators
- [ ] Screen reader announces async state changes
- [ ] Mobile layout single-column, touch targets ≥ 44px
- [ ] No dead code or unused exports
- [ ] README accurate

---

## Complete File Creation Map (40 New Files)

| # | File | Phase | Size | Purpose |
|---|------|-------|------|---------|
| 1 | `src/domain/executionMachine.ts` | 2 | L | useReducer state machine |
| 2 | `src/hooks/useSwapExecution.ts` | 2 | L | Swap execution hook |
| 3 | `src/hooks/useLiveQuotes.ts` | 2 | L | React Query wrapper |
| 4 | `src/hooks/useWalletReconnect.ts` | 2 | M | Silent wallet reconnect |
| 5 | `src/hooks/usePreferences.ts` | 2 | M | User preference persistence |
| 6 | `src/hooks/useTxPersistence.ts` | 2 | M | Pending tx tracking |
| 7 | `src/hooks/useTabVisibility.ts` | 2 | S | Auto-refresh on tab visible |
| 8 | `src/hooks/useSafeAsync.ts` | 2 | M | AbortController + request ID |
| 9 | `src/hooks/useDebouncedValue.ts` | 2 | S | 400ms input debounce |
| 10 | `src/components/ErrorBoundary.tsx` | 2 | M | React error boundary |
| 11 | `src/components/NetworkStatus.tsx` | 2 | M | Degraded mode banner |
| 12 | `src/domain/feeEstimation.ts` | 1 | S | Fee estimator |
| 13 | `src/domain/slippage.ts` | 4 | L | Slippage calculator |
| 14 | `src/components/SlippageSettings.tsx` | 4 | L | Slippage tolerance selector |
| 15 | `src/components/Announcer.tsx` | 7 | M | ARIA live region |
| 16 | `src/services/tokenRegistry.ts` | 7 | M | CIP-26 metadata fetcher |
| 17 | `src/hooks/useTokenList.ts` | 7 | M | React Query token cache |
| 18 | `src/components/TokenSelector.tsx` | 7 | L | Virtualized token picker |
| 19 | `src/adapters/baseAdapter.ts` | 5 | L | Template Method base |
| 20 | `src/telemetry/logger.ts` | 5 | M | Structured event logger |
| 21 | `src/workers/routeWorker.ts` | 5 | M | Web Worker for routing |
| 22 | `src/config/networkConfig.ts` | 6 | M | Multi-network config |
| 23 | `src/domain/utxoCheck.ts` | 6 | S | Pre-flight balance check |
| 24 | `src/wallet/mobileWallet.ts` | 7 | S | Mobile detection |
| 25 | `src/domain/amm.property.test.ts` | 3 | M | AMM invariant tests |
| 26 | `src/domain/quoteEngine.property.test.ts` | 3 | M | Quote engine property tests |
| 27 | `test/arbitraries.ts` | 3 | M | Shared generators |
| 28 | `e2e/swap-flow.test.ts` | 3 | M | Mock wallet E2E tests |
| 29 | `src/adapters/minswapBuildTx.test.ts` | 3 | M | Build/submit tx tests |
| 30 | `src/adapters/minswapV2DirectPoolAdapter.test.ts` | 3 | M | Direct pool adapter tests |
| 31 | `src/adapters/sundaeSwapV3DirectPoolAdapter.test.ts` | 3 | M | Direct pool adapter tests |
| 32 | `src/main.integration.test.ts` | 2 | M | Integration safety net |
| 33 | `api/proxy.ts` | 5 | L | Serverless API proxy |
| 34 | `public/sw.js` | 7 | S | Service worker |
| 35 | `public/manifest.json` | 7 | S | PWA manifest |
| 36 | `stryker.config.json` | 3 | S | Mutation testing config |
| 37 | `lighthouserc.js` | 5 | S | Performance budget |
| 38 | `eslint.config.js` | 5 | M | Linting config |
| 39 | `.prettierrc` | 7 | S | Formatting config |
| 40 | `.editorconfig` | 7 | S | Editor settings |

---

## Intra-Phase Ordering Summary

| Phase | Order |
|-------|-------|
| 0 | BUG-4 → BUG-1 → PROTO-1 → D3 |
| 1 | BUG-3/NUM-4 → CQ-1 → NUM-2 → GAS-2/3 → D22 |
| 2 | D1 → D2 → D20 → D19 → D17 → main.tsx |
| 3 | amm.pbt → TG-5 → TG-3 → TG-1 → quoteEngine.pbt → TG-4 → D9 → Stryker |
| 4 | D23 → D6 → PERF-1/2 |
| 5 | D7 base → D7 adapters → D8 → D10 → D14 → D16 → D13 |
| 6 | D12 → PROTO-3 → CIP30-1 → PROTO-4 → NUM-1 → D18 → TK-1/3 → D24 |
| 7 | D15 → D21 → A11Y → D11 → D25 → DOC → cleanup |

---

## Rollback Strategy per Phase

| Phase | Rollback Complexity | Key Principle |
|-------|--------------------|---------------|
| 0 | Easy | Each fix is one commit. Revert individually. |
| 1 | Easy | Single shared function extraction + rename. Revert to inline code. |
| 2 | ⚠️ Hard | 6 decisions, 11 new files, main.tsx rewrite. **Use feature branch. Commit per decision. Revert merge if tests fail.** |
| 3 | N/A | Tests are additive. Don't revert — debug failing tests. |
| 4 | Easy | New files only. Revert to remove. |
| 5 | Medium | BaseDexAdapter touches all 7 adapters. Revert per-adapter commits. |
| 6 | Easy | New files + small config changes. Revert individually. |
| 7 | Easy | CSS + static files + docs. No functional rollback needed. |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Phase 2 rewrite breaks wallet | Medium | 🔴 Critical | Feature branch, commit per decision, test each decision before next |
| PROTO-1 fix changes mock behavior | Low | 🟡 Medium | Verify mock adapter tests still pass |
| BaseDexAdapter introduces regression | Medium | 🟡 Medium | Refactor one adapter at a time, `npm test` after each |
| `partialSign: true` causes wallet rejections | Medium | 🟡 Medium | Test against Lace/Eternl on preprod first |
| ESLint finds many warnings | High | 🟢 Low | `--fix` for auto-fixable, triage rest |
| Network selector confuses CIP-30 wallets | Medium | 🟡 Medium | Add mismatch warning, test with real wallets |
| Stryker finds many surviving mutants | High | 🟢 Low | Triage, prioritize `amm.ts` + `quoteEngine.ts` |
| Bundle size limit blocks CI | Low | 🟢 Low | Adjust limit upward temporarily, fix the bloat, lower limit |

---

## Timeline Estimate

| Execution Mode | Phases | Hours |
|---------------|--------|-------|
| **MVP only** | A → B → C → D | **13-16 hours** |
| **Single dev, sequential** | 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 | **32-48 hours** |
| **Single dev with parallelism** | 0 → {1, 2, 6} → {3, 4} → 5 → 7 | **25-35 hours** |
| **3 developers** | 0 (all) → {1, 2, 6} (one each) → {3, 4} (two) → 5 (one) → 7 (one) | **20-30 hours** |

**Sprint plan (single developer)**:

| Sprint | Duration | Phases | Deliverable |
|--------|----------|--------|-------------|
| 1 | 1 week | 0, 1, 2 | Build passes, React Query, useReducer, session, error boundaries |
| 2 | 1 week | 3, 4 | 85% coverage, property tests, E2E, slippage UX |
| 3 | 1 week | 5, 6 | BaseDexAdapter, code split, proxy, multi-network, UTXO checks |
| 4 | 1 week | 7 | PWA, accessibility, mobile, dead code, docs |

## References

- **Audit**: `docs/ENHANCED-AUDIT.md` (130 findings)
- **Deep Research**: `docs/DEEP-RESEARCH-ADDENDUM.md` (Decisions 10-25)
- **Original Plan**: `docs/IMPLEMENTATION-PLAN.md` (Decisions 1-9)
- **Architecture**: `docs/ARCHITECTURE.md`
- **Decisions Log**: `docs/DECISIONS.md`
- **Security Review**: `docs/SECURITY-REVIEW.md`
