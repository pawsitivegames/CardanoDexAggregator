# ClearRoute Remediation Roadmap

Derived from: `docs/ENHANCED-AUDIT.md` (130 findings across 7 audit levels)  
Date: 2026-06-12  
Status: **Plan only — no fixes applied yet**

---

## Strategic Architecture Improvements (Phase 0-A)

*Based on research into production Cardano dApps (Lace, Yoroi, DexHunter, Uniswap, Jupiter), modern React patterns (useReducer, React Query, discriminated unions), DeFi testing strategies (fast-check, Stryker), and Cardano protocol specifications.*

### Decision 1: Adopt `useReducer` with discriminated unions for swap execution

**Tradeoff**: XState (~15KB) adds formal verification but requires learning curve. `useReducer` with TypeScript discriminated unions gives us **infeasible-state prevention** (the compiler prevents accessing `.txHash` when `state.step !== "tracking"`) with 0KB bundle impact.

**Concrete implementation — Pipeline-based state machine**:

```ts
// src/domain/executionMachine.ts (NEW FILE)

export type SwapState =
  | { step: "preview_ready" }
  | { step: "refreshing_quote" }
  | { step: "building_transaction" }
  | { step: "awaiting_signature" }
  | { step: "signing" }
  | { step: "submitting" }
  | { step: "submitted"; txHash: string; submittedAt: string }
  | { step: "tracking"; txHash: string; submittedAt: string }
  | { step: "confirmed"; txHash: string; blockHeight: number }
  | { step: "failed"; error: string }
  | { step: "expired"; error: string };

export type SwapAction =
  | { type: "START_REFRESH" }
  | { type: "START_BUILD" }
  | { type: "START_SIGN" }
  | { type: "START_SUBMIT" }
  | { type: "TX_SUBMITTED"; txHash: string }
  | { type: "TX_TRACKING"; txHash: string }
  | { type: "TX_CONFIRMED"; txHash: string; blockHeight: number }
  | { type: "FAIL"; error: string }
  | { type: "EXPIRE"; error: string }
  | { type: "RESET" };

// Pipeline: maps (current step, action) → next step
const TRANSITIONS: Record<SwapState["step"], Partial<Record<SwapAction["type"], SwapState["step"]>>> = {
  preview_ready:        { START_REFRESH: "refreshing_quote", RESET: "preview_ready" },
  refreshing_quote:     { START_BUILD: "building_transaction", FAIL: "failed" },
  building_transaction: { START_SIGN: "awaiting_signature", FAIL: "failed" },
  awaiting_signature:   { START_SIGN: "signing" },
  signing:              { START_SUBMIT: "submitting", FAIL: "failed" },
  submitting:           { TX_SUBMITTED: "submitted", TX_TRACKING: "tracking", FAIL: "failed" },
  submitted:            { RESET: "preview_ready" },
  tracking:             { TX_CONFIRMED: "confirmed", FAIL: "failed", EXPIRE: "expired" },
  confirmed:            { RESET: "preview_ready" },
  failed:               { RESET: "preview_ready" },
  expired:              { RESET: "preview_ready" },
};

export function swapReducer(state: SwapState, action: SwapAction): SwapState {
  const allowed = TRANSITIONS[state.step];
  const nextStep = allowed?.[action.type];
  
  // Invalid transition — silently ignore (prevents impossible states)
  if (!nextStep) return state;
  
  // Build next state with the correct payload for each step
  switch (action.type) {
    case "START_REFRESH": case "START_BUILD": case "START_SIGN":
    case "START_SUBMIT": case "RESET":
      return { step: nextStep } as SwapState;
    case "TX_SUBMITTED":
      return { step: nextStep, txHash: action.txHash, submittedAt: new Date().toISOString() } as SwapState;
    case "TX_TRACKING":
      return { step: nextStep, txHash: action.txHash, submittedAt: new Date().toISOString() } as SwapState;
    case "TX_CONFIRMED":
      return { step: nextStep, txHash: action.txHash, blockHeight: action.blockHeight } as SwapState;
    case "FAIL":
      return { step: nextStep, error: action.error } as SwapState;
    case "EXPIRE":
      return { step: nextStep, error: action.error } as SwapState;
  }
}
```

**Async side effects go in `useEffect`, not the reducer**:

```ts
// In the component:
const [execState, dispatch] = useReducer(swapReducer, { step: "preview_ready" });
const isExecuting = useRef(false);

// Effect: listen for steps that need async work
useEffect(() => {
  if (execState.step === "refreshing_quote") refreshAndBuild();
  if (execState.step === "signing") signTransaction();
  if (execState.step === "tracking") startTracking();
}, [execState.step]);

// Double-click guard at the dispatch level:
const execute = () => {
  if (isExecuting.current) return;
  isExecuting.current = true;
  dispatch({ type: "START_REFRESH" });
};
```

**Key advantages over current inline setExecutionState**:
- TypeScript **proves** you can't access `txHash` when `step === "preview_ready"`
- Invalid transitions (e.g., `submitted → signing`) are **impossible** at the type level
- The `RESET` action enables retry from ANY terminal state (fixes SM-1)
- Double-click guard at the dispatch boundary (fixes RACE-1)

**Timing**: Phase 2 (after build unblock)

### Decision 2: Adopt React Query for live quote fetching

**Tradeoff**: @tanstack/react-query (~12-15KB min+gzipped, highly tree-shakable) eliminates 30% of main.tsx boilerplate. Handles caching, stale-while-revalidate, automatic AbortController integration, and retry logic.

**Concrete implementation**:

```ts
// src/hooks/useLiveQuotes.ts (NEW FILE)
import { useQuery } from "@tanstack/react-query";
import type { QuoteRequest, QuoteAdapterResult } from "../domain/routes";

const ALL_ADAPTERS = [
  minswapLiveReadOnlyAdapter,
  dexHunterReadOnlyAdapter,
  steelswapReadOnlyAdapter,
  cardexscanReadOnlyAdapter,
  saturnSwapReadOnlyAdapter,
  minswapV2DirectPoolAdapter,
  sundaeSwapV3DirectPoolAdapter,
];

export function useLiveQuotes(request: QuoteRequest) {
  return useQuery({
    queryKey: ["liveQuotes", request.inputAssetId, request.outputAssetId, request.amountIn, request.slippageTolerancePct, request.network],
    queryFn: async ({ signal }): Promise<QuoteAdapterResult[]> => {
      const settled = await Promise.allSettled(
        ALL_ADAPTERS.map((adapter) => adapter.getQuotes(request))
      );
      // ... process settled into QuoteAdapterResult[]
      return allResults;
    },
    staleTime: 20_000,       // DEX quotes change every ~20s (one Cardano block)
    gcTime: 60_000,           // Keep old quotes for 1 min after unmount
    retry: 0,                 // Don't retry — show error immediately for live quotes
    refetchOnWindowFocus: false, // Don't refetch on tab switch (unnecessary for DEX)
  });
}
```

**Why `queryKey` changes auto-abort**: React Query's `signal` is automatically aborted when `queryKey` changes (e.g., user changes token pair). This eliminates RACE-2 without any manual AbortController management.

**Dependent query for transaction preview**:
```ts
const { data: preview } = useQuery({
  queryKey: ["preview", decision?.selectedRoute?.id],
  queryFn: () => createTransactionPreview(decision!, walletContext),
  enabled: !!decision?.selectedRoute,  // Only fetch when we have a route
});
```

**Polling for tx confirmation** (replaces manual Blockfrost polling):
```ts
const { data: txStatus } = useQuery({
  queryKey: ["txStatus", txHash],
  queryFn: () => fetchTxStatus(txHash),
  refetchInterval: (query) => 
    query.state.data?.status === "confirmed" ? false : 2_000, // Poll every 2s until confirmed
  enabled: !!txHash,
});
```

**Timing**: Phase 2 (after build unblock, alongside state machine)

### Decision 3: Replace custom CborReader with `cborg` library

**Tradeoff**: cborg (~8KB, MIT license, pure JS) is the industry-standard CBOR parser. Replaces 65 lines of hand-written parsing code that has no fuzz testing and 9 distinct throw paths.

**What changes**:
- `npm install cborg`
- Delete `class CborReader` (lines 112-182 of cip30.ts)
- Rewrite `parseBalanceCbor` using `cborg.decode()` 
- Eliminates CQ-4 (custom parser attack surface) and PROTO-4 (empty string crash) in one change

**Timing**: Phase 0-B (immediate — security quick-win, low effort)

### Decision 4: Add property-based testing with fast-check

**Tradeoff**: fast-check (~8KB dev dependency) catches edge cases that traditional unit tests miss — especially for AMM math where floating-point precision, extreme values, and boundary conditions matter.

**Concrete implementation — AMM invariant tests**:

```ts
// src/domain/amm.property.test.ts (NEW FILE)
import { describe, it } from "vitest";
import * as fc from "fast-check";
import { constantProductSwap, computeOptimalSplit } from "./amm";

// Shared arbitraries (also in test/arbitraries.ts)
const poolStateArb = fc.record({
  reserveIn: fc.double({ min: 1, max: 1_000_000_000 }),
  reserveOut: fc.double({ min: 1, max: 1_000_000_000 }),
  feeBps: fc.integer({ min: 0, max: 10000 }),
});

const positiveInput = fc.double({ min: 0.000001, max: 1_000_000 });

describe("constantProductSwap — property tests", () => {
  it("preserves k-invariant (within epsilon)", () => {
    fc.assert(
      fc.property(poolStateArb, positiveInput, (pool, input) => {
        const output = constantProductSwap(input, pool.reserveIn, pool.reserveOut, pool.feeBps);
        const feeFactor = Math.max(0, 1 - pool.feeBps / 10000);
        const effectiveInput = input * feeFactor;
        
        const newReserveIn = pool.reserveIn + effectiveInput;
        const newReserveOut = pool.reserveOut - output;
        
        // k-invariant: (rIn + effIn) * (rOut - out) ≈ rIn * rOut
        const lhs = newReserveIn * newReserveOut;
        const rhs = pool.reserveIn * pool.reserveOut;
        const tolerance = Math.max(lhs, rhs) * 1e-12; // Relative tolerance
        
        return Math.abs(lhs - rhs) <= tolerance;
      })
    );
  });

  it("output never exceeds reserveOut", () => {
    fc.assert(
      fc.property(poolStateArb, positiveInput, (pool, input) => {
        const output = constantProductSwap(input, pool.reserveIn, pool.reserveOut, pool.feeBps);
        return output <= pool.reserveOut;
      })
    );
  });

  it("zero input produces zero output", () => {
    fc.assert(
      fc.property(poolStateArb, (pool) => {
        return constantProductSwap(0, pool.reserveIn, pool.reserveOut, pool.feeBps) === 0;
      })
    );
  });
});

describe("computeOptimalSplit — property tests", () => {
  it("allocations sum to totalInput (within 1e-8)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 100_000 }),
        fc.array(poolStateArb, { minLength: 2, maxLength: 5 }),
        (totalInput, pools) => {
          const result = computeOptimalSplit(totalInput, pools);
          const sum = result.allocations.reduce((s, a) => s + a, 0);
          return Math.abs(sum - totalInput) < 1e-8;
        }
      )
    );
  });

  it("split never worse than any single pool", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 100_000 }),
        fc.array(poolStateArb, { minLength: 2, maxLength: 3 }),
        (totalInput, pools) => {
          const result = computeOptimalSplit(totalInput, pools);
          for (let i = 0; i < pools.length; i++) {
            const singleOutput = constantProductSwap(
              totalInput, pools[i].reserveIn, pools[i].reserveOut, pools[i].feeBps
            );
            // Split should be at least as good as the best single pool
            // (may be slightly worse due to float precision — allow 1% margin)
            if (result.totalOutput < singleOutput * 0.99) return false;
          }
          return true;
        }
      )
    );
  });
});
```

**Key fast-check features**:
- **Built-in shrinking**: When a property fails, fast-check finds the **minimal** failing case automatically (e.g., if `reserveIn: 1,000,000` fails, it tries `999,999`, `500,000`, ..., down to the smallest failing value)
- **Seed reproducibility**: Every run logs a seed — paste it into `fc.assert(..., { seed: 123456 })` to reproduce flaky failures
- **numRuns**: Default is 100 — increase to 10,000 for CI to catch rare edge cases

**Timing**: Phase 3 (alongside test coverage improvements)

### Decision 5: Keep REST API approach — do NOT adopt CSL/MeshJS

**Why**: CSL/MeshJS add 1.5-2.5MB of WASM to the bundle (3-10× current bundle size). For a read-only aggregator with mock execution, the REST API approach is correct. If real on-chain transaction building becomes necessary, use MeshJS with dynamic imports: `const { MeshTxBuilder } = await import("@meshsdk/core")` — this code-splits the WASM so it's never loaded for read-only users.

### Decision 6: Error recovery UX — production-grade failure handling

**Research from Uniswap/Jupiter/1inch patterns**:

1. **Human-readable error mapping**: Instead of raw error strings, map failures to user-friendly messages:
```ts
const ERROR_MESSAGES: Record<string, string> = {
  "slippage_exceeded": "Price moved too much. Try increasing slippage tolerance.",
  "insufficient_funds": "You don't have enough tokens. Top up your wallet.",
  "user_rejected": "You rejected the signature. Try again when ready.",
  "network_error": "Network request failed. Check your connection and try again.",
  "timeout": "Request timed out. The network might be congested.",
  "stale_quote": "Quote expired. A fresh quote has been loaded.",
};
```

2. **Keep inputs on failure**: Don't reset the amount or token pair when a swap fails
3. **Auto-refresh on stale quote**: If `comparePreviewToRefreshedRoute` blocks, trigger a fresh quote fetch instead of just showing the error
4. **localStorage tx persistence**: Store submitted tx hashes in localStorage (keyed by wallet address) so tracking survives page refreshes

**Timing**: Phase 4 (UX improvements)

### Decision 7: Adapter standardization with Template Method pattern

**Tradeoff**: Introducing an abstract `BaseDexAdapter` class centralizes the 9× duplicated `fetchWithTimeout`, error handling, and response normalization. All 7 adapters (plus future ones) extend the base class and only implement two methods: `buildRequest()` and `normalizeResponse()`.

**Concrete implementation**:

```ts
// src/adapters/baseAdapter.ts (NEW FILE — replaces duplicated code in 9 files)
import { fetchWithTimeout, asNumber } from "./fetchUtils";
import type { QuoteRequest, QuoteAdapterResult } from "./types";

export abstract class BaseDexAdapter {
  abstract readonly adapterId: string;
  abstract readonly adapterName: string;

  // Static capability metadata — replaces inconsistent network gating throughout codebase
  static readonly supportedNetworks: string[] = ["mainnet"];
  static readonly supportedPairs?: { inputAssetId: string; outputAssetId: string }[];

  // Template Method: defines the algorithm skeleton
  async getQuotes(request: QuoteRequest): Promise<QuoteAdapterResult[]> {
    // Guard: network gating (replaces scattered `if (request.network !== "mainnet")` checks)
    if (!this.supportsNetwork(request.network)) {
      return [this.failure(request, "unsupported_pair", 
        `${this.adapterName} does not support ${request.network}.`)];
    }

    try {
      const raw = await this.fetchData(request);       // Step 1: fetch (subclass implements)
      const normalized = this.normalizeResponse(raw, request); // Step 2: normalize (subclass implements)
      return [this.success(request, normalized)];
    } catch (error) {
      return [this.failure(request, "network_error", 
        error instanceof Error ? error.message : "Unknown error")];
    }
  }

  // Subclasses implement these two methods
  protected abstract fetchData(request: QuoteRequest): Promise<unknown>;
  protected abstract normalizeResponse(raw: unknown, request: QuoteRequest): NormalizedQuote;

  // Shared infrastructure (was duplicated 9 times)
  protected async fetchWithTimeout(url: string, timeoutMs = 8_000): Promise<Response> {
    return fetchWithTimeout(url, timeoutMs);
  }

  protected supportsNetwork(network: string): boolean {
    const Ctor = this.constructor as typeof BaseDexAdapter;
    return Ctor.supportedNetworks.includes(network);
  }

  // Circuit breaker: track failures, stop querying if adapter is unhealthy
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private circuitResetTime = 0;

  protected async withCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
    if (this.circuitOpen) {
      if (Date.now() < this.circuitResetTime) {
        throw new Error(`Circuit open for ${this.adapterName}`);
      }
      this.circuitOpen = false; // Try again after cooldown
    }
    try {
      const result = await fn();
      this.consecutiveFailures = 0;
      return result;
    } catch {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 3) {
        this.circuitOpen = true;
        this.circuitResetTime = Date.now() + 60_000; // 60s cooldown
      }
      throw error;
    }
  }
}
```

**What each adapter becomes** (example — minswapLiveAdapter shrinks from ~180 lines to ~50):

```ts
// src/adapters/minswapLiveAdapter.ts (AFTER refactoring)
export class MinswapLiveAdapter extends BaseDexAdapter {
  readonly adapterId = "minswap_live";
  readonly adapterName = "Minswap (Live Aggregator)";
  static readonly supportedNetworks = ["mainnet"];
  static readonly supportedPairs = [
    { inputAssetId: "lovelace", outputAssetId: "279c909f...534e454b" } // ADA→SNEK
  ];

  protected async fetchData(request: QuoteRequest): Promise<unknown> {
    const url = `https://api.minswap.org/aggregator/estimate?...`;
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  protected normalizeResponse(raw: any, request: QuoteRequest): NormalizedQuote {
    // ... minswap-specific normalization ...
  }
}
```

**What this eliminates**:
- 9× duplicated `fetchWithTimeout` in one shot
- 3× duplicated `asNumber` 
- 7 inconsistent network gating functions → one `supportsNetwork()` guard
- Circuit breaker for production resilience (if an adapter fails 3× consecutively, stop querying it for 60s)
- Static metadata enables adapter discovery: the UI can show which adapters support which pairs

**Timing**: Phase 5 (code quality — after build unblock and runtime safety)

### Decision 8: Dynamic adapter loading for code splitting

**Tradeoff**: Currently all 7 adapters are statically imported in main.tsx, adding ~100KB to the initial bundle. With dynamic imports, each adapter loads on demand as its own chunk — the initial bundle drops to ~160KB and adapters only load when needed.

**Concrete implementation**:

```ts
// src/hooks/useLiveQuotes.ts (with dynamic adapter loading)
const ADAPTER_LOADERS = [
  () => import("../adapters/minswapLiveAdapter").then(m => m.minswapLiveReadOnlyAdapter),
  () => import("../adapters/dexHunterLiveAdapter").then(m => m.dexHunterReadOnlyAdapter),
  () => import("../adapters/steelswapLiveAdapter").then(m => m.steelswapReadOnlyAdapter),
  () => import("../adapters/cardexscanLiveAdapter").then(m => m.cardexscanReadOnlyAdapter),
  () => import("../adapters/saturnSwapLiveAdapter").then(m => m.saturnSwapReadOnlyAdapter),
  () => import("../adapters/minswapV2DirectPoolAdapter").then(m => m.minswapV2DirectPoolAdapter),
  () => import("../adapters/sundaeSwapV3DirectPoolAdapter").then(m => m.sundaeSwapV3DirectPoolAdapter),
];

export function useLiveQuotes(request: QuoteRequest) {
  return useQuery({
    queryKey: ["liveQuotes", ...],
    queryFn: async ({ signal }) => {
      // Load all adapters in parallel (each in its own chunk)
      const adapters = await Promise.all(ADAPTER_LOADERS.map(load => load()));
      const settled = await Promise.allSettled(
        adapters.map(adapter => adapter.getQuotes(request))
      );
      // ...
    },
    staleTime: 20_000,
  });
}
```

**Bundle impact**:
| Before | After |
|--------|-------|
| 255KB JS (single chunk) | ~160KB main + 7×~15KB adapter chunks |
| All adapters load on page open | Only mock adapter loads initially; live adapters load on first quote |
| No code splitting | 8 chunks total (main + 7 adapters) |

**Also add**: `rollup-plugin-visualizer` to analyze bundle composition and verify the split.

**Timing**: Phase 5 (code quality — alongside adapter standardization)

### Decision 9: E2E testing with mocked CIP-30 wallet

**Tradeoff**: Current e2e tests (`e2e/smoke.test.ts`) only assert static UI elements. Mock wallet injection enables testing the full swap flow deterministically.

**Concrete implementation**:

```ts
// e2e/swap-flow.test.ts (NEW FILE)
import { test, expect } from "@playwright/test";

test.describe("Swap execution flow", () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock CIP-30 wallet before the app loads
    await page.addInitScript(() => {
      (window as any).cardano = {
        mockWallet: {
          name: "MockWallet",
          apiVersion: "1.0.0",
          enable: async () => ({
            getNetworkId: async () => 0, // preprod
            getBalance: async () => "a200581c...", // CBOR with 10k ADA
            getUsedAddresses: async () => ["addr_test1..."],
            getChangeAddress: async () => "addr_test1...",
            signTx: async (tx: string) => "84a500...", // Mock signature
            submitTx: async (tx: string) => "abc123...",  // Mock tx hash
          }),
          isEnabled: async () => true,
        },
      };
    });

    // Mock DEX API responses
    await page.route("**/api.minswap.org/aggregator/estimate**", route =>
      route.fulfill({ json: mockMinswapResponse }));
    await page.route("**/api.dexhunter.finance**", route =>
      route.fulfill({ json: mockDexHunterResponse }));
  });

  test("happy path: connect → get quote → mock swap → confirmed", async ({ page }) => {
    await page.goto("/");
    
    // Connect wallet
    await page.getByRole("button", { name: /mockwallet/i }).click();
    await expect(page.getByText(/connected/i)).toBeVisible();
    
    // Enter amount
    await page.fill('input[aria-label="Amount"]', "100");
    await expect(page.getByText(/net received/i)).toBeVisible();
    
    // Click swap
    await page.getByRole("button", { name: /confirm and swap/i }).click();
    
    // Verify confirmation
    await expect(page.getByText(/swap confirmed/i)).toBeVisible();
  });

  test("error: wallet rejection shows friendly message", async ({ page }) => {
    // Override: wallet rejects signature
    await page.addInitScript(() => {
      // ... same as above, but signTx throws ...
    });
    // ...
  });

  test("error: DEX API timeout shows error state", async ({ page }) => {
    await page.route("**/api.minswap.org/**", route => route.abort("timedout"));
    // ... verify error UI ...
  });
});
```

**Testing pyramid for this project**:
| Layer | Tools | Target % | Files |
|-------|-------|----------|-------|
| Unit | vitest | 70% | `*.test.ts` — domain logic, adapters, utilities |
| Property | fast-check | 10% | `*.property.test.ts` — AMM math, invariants |
| Integration | vitest + renderHook | 15% | `*.integration.test.ts` — hooks with mocked APIs |
| E2E | Playwright | 5% | `e2e/swap-flow.test.ts` — critical paths only |

**Timing**: Phase 3 (alongside test coverage improvements)

---

## Main.tsx Refactoring Migration Strategy

*Based on the "Extract Till You Drop" philosophy with a safety-net testing approach.*

### Step-by-step extraction plan:

```
main.tsx (currently ~600 lines)
│
├── Step 0: Add integration tests (safety net)
│   └── Before any extraction, write tests that render <App/> and assert:
│       - Token cycling updates the displayed symbols
│       - Amount change triggers live quote loading state
│       - Wallet discovery shows provider buttons
│       - Connected wallet shows balance
│       - Route table renders with mock routes
│
├── Step 1: Extract useWalletDiscovery (~80 lines saved)
│   └── Pull out: discoverAndSetWallets, cardano event listener, setTimeout cleanup
│   └── Hook: useWalletDiscovery() → { providers, connect, disconnect, context }
│   └── Verify: integration tests pass
│
├── Step 2: Extract useLiveQuotes (~50 lines saved)
│   └── Pull out: liveQuote state, useEffect with Promise.allSettled
│   └── Hook: useLiveQuotes(request) → { results, isLoading, error }
│   └── Verify: integration tests pass
│
├── Step 3: Extract useRouteDecision (~20 lines saved)
│   └── Pull out: buildDecision, useMemo wrappers
│   └── Hook: useRouteDecision(request, results, buffer) → decision
│   └── Verify: integration tests pass
│
├── Step 4: Extract useSwapExecution (~120 lines saved)
│   └── Pull out: handleExecuteSwap, executionState, approvedPreviewRef
│   └── Hook: useSwapExecution(api, request, preview) → { state, execute, reset }
│   └── Verify: integration tests pass
│
└── After: main.tsx = ~200 lines of pure JSX
    └── Only: layout markup, conditional rendering, event handlers → hook calls
```

**When to STOP extracting** (anti-patterns to avoid):
- Don't extract a 3-line hook used only once (e.g., `useSlippageSegments` — not worth it)
- Don't extract markup-only sections into components unless they're reused
- Don't extract if you can't name the result clearly
- Do extract when: the logic is complex, has tests, or is reused

**Integration test example** (runs during extraction to prevent regressions):

```ts
// src/main.integration.test.ts (NEW FILE)
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

test("token cycling updates display", async () => {
  render(<App />);
  const fromButton = screen.getByText("ADA");
  await userEvent.click(fromButton);
  expect(screen.getByText("SNEK")).toBeInTheDocument(); // ADA → SNEK
});

test("amount input triggers quote loading", async () => {
  render(<App />);
  const input = screen.getByLabelText("Amount");
  await userEvent.clear(input);
  await userEvent.type(input, "500");
  expect(screen.getByText(/loading live quotes/i)).toBeInTheDocument();
});
```

| Phase | Name | Fixes | Est. Effort | Gates |
|-------|------|-------|-------------|-------|
| 0 | Build Unblock | BUG-1, BUG-2, PROTO-1, BUG-4 | 1-2 hours | `npm run build` passes, `tsc --noEmit` clean |
| 1 | Data Integrity | BUG-3, NUM-4, CQ-1, NUM-2, GAS-2, GAS-3 | 2-3 hours | All net-output paths consistent |
| 2 | Runtime Safety | RACE-1, RACE-2, LEAK-1, RISK-2, RISK-3, SEC-1 | 2-3 hours | No crash/race vectors |
| 3 | Test Coverage | TG-1..TG-5, L4-2, L4-5, PBT-1..PBT-6 | 4-6 hours | 85%+ branch coverage |
| 4 | React Performance | PERF-1, PERF-2, PERF-3, SM-1, SM-2 | 2-3 hours | No render-thrashing |
| 5 | Code Quality | CQ-2..CQ-6, CC-1..CC-3, CI-1, L5-2..L5-4, BUNDLE-3 | 3-4 hours | CI green, linting active |
| 6 | Protocol & Wallet | CIP30-1, CIP30-2, PROTO-2..PROTO-4, NUM-1, NUM-3, TK-1, TK-3 | 3-4 hours | CIP-30 compliant |
| 7 | Polish & A11y | A11Y-1..A11Y-5, DOC-1..DOC-3, SEC-2..SEC-4, PC-1..PC-14, dead code | 3-4 hours | WCAG 2.1 AA |

**Total estimated effort: 20-29 hours** (across all phases)

---

## Phase 0-A: Build Unblock (CRITICAL)

**Goal**: `npm run build` and `tsc --noEmit` must succeed.

### Fix 0-A.1: BUG-1 — computeSwapPriceImpactPct argument mismatch

**Files**: `src/adapters/minswapV2DirectPoolAdapter.ts:98`, `src/adapters/sundaeSwapV3DirectPoolAdapter.ts:113`, `src/domain/amm.test.ts:40,44`

**What to do**:
1. Change callers to pass `reserveIn` (not `output`) as the 2nd argument
2. `minswapV2DirectPoolAdapter.ts:98`: Change `computeSwapPriceImpactPct(amountInDecimal, output, reserveOut)` → `computeSwapPriceImpactPct(amountInDecimal, reserveIn)`
3. `sundaeSwapV3DirectPoolAdapter.ts:113`: Same change
4. `amm.test.ts:40`: Change `computeSwapPriceImpactPct(100, 0, 1000)` → `computeSwapPriceImpactPct(100, 190)` and expect `toBeCloseTo(34.48, 1)`
5. `amm.test.ts:44`: Same — verify actual value

**Verification**: `npx tsc --noEmit` must show 0 errors

### Fix 0.2: PROTO-1 — Lovelace decimal scaling is WRONG

**Files**: `src/adapters/minswapV2DirectPoolAdapter.ts:86`, `src/adapters/sundaeSwapV3DirectPoolAdapter.ts:105`

**What to do**:
1. Remove the `inputAsset.id === "lovelace" ? 1` special case
2. Use `10 ** inputAsset.decimals` unconditionally for all assets
3. The `ASSETS` array correctly defines `lovelace` with `decimals: 6`, so `10 ** 6` will correctly scale ADA

**Verification**: Direct-pool adapter quotes for ADA→SNEK must produce reasonable outputs (e.g., 1,000 ADA → ~460,000 SNEK, not ~0.46 SNEK)

### Fix 0.3: BUG-4 — Deduplicate fetchWithTimeout and asNumber

**Files**: 9 files with `fetchWithTimeout`, 3 files with `asNumber`

**What to do**:
1. In `minswapLiveAdapter.ts`: Delete local `fetchWithTimeout` and `asNumber`, add `import { fetchWithTimeout, asNumber } from "./fetchUtils"`
2. In `aggregatorLiveAdapter.ts`: Same
3. In `dexHunterLiveAdapter.ts`: Delete local `fetchWithTimeout`, import from `fetchUtils`
4. In `steelswapLiveAdapter.ts`: Same
5. In `cardexscanLiveAdapter.ts`: Same
6. In `saturnSwapLiveAdapter.ts`: Same
7. In `minswapBuildTx.ts`: Same
8. In `minswapV2DirectPoolAdapter.ts`: Same
9. In `sundaeSwapV3DirectPoolAdapter.ts`: Replace `AbortSignal.timeout()` with `fetchWithTimeout` for consistency

**Verification**: `npx tsc --noEmit` clean, all tests pass

### Gate Check for Phase 0:
- [ ] `npm run build` succeeds (exit code 0)
- [ ] `npx tsc --noEmit` shows 0 errors
- [ ] `npm test` all 81 tests pass
- [ ] No regressions in mock/live adapter behavior

---

## Phase 1: Data Integrity (CRITICAL — Must Fix Before Production)

### Fix 1.1: BUG-3 + NUM-4 — Unify net-output calculation

**Files**: `src/domain/aggregator.ts:49,60`, `src/domain/quoteEngine.ts:27`

**What to do**:
1. Extract a shared function `computeNetOutput(grossOutput, fees, inputAsset, amountIn)` in `src/domain/fees.ts` (or a new `src/domain/math.ts`)
2. Use `inputAsset.mockPriceAda` to convert `amountIn` to ADA value before computing fee fraction
3. Call this from both `netOutputForCandidate` (quoteEngine) and `computeNetOutput` (aggregator)
4. Deprecate/remove the aggregator's local `computeNetOutput`

**Verification**: Add test with non-ADA input (e.g., SNEK → MIN) to verify both paths produce identical results

### Fix 1.2: CQ-1 — Fee consistency gap

**Files**: `src/domain/aggregator.ts`

**What to do**: After Fix 1.1, verify that `computeNetOutput` in aggregator uses the same formula as `netOutputForCandidate`. This may already be resolved by the unification.

### Fix 1.3: NUM-2 — Replace mockPriceAda with live price in fee conversion

**Files**: `src/domain/quoteEngine.ts:32`

**What to do**: When `candidate.source.quoteMode === "live"`, derive fee conversion from the trade's own implied price (`grossOutput / amountIn`) instead of `mockPriceAda`. This was partially fixed in ISSUE-2a but the mock→live transition is incomplete.

### Fix 1.4: GAS-2 + GAS-3 — Standardize fee fields

**Files**: All adapter files, `src/domain/fees.ts`

**What to do**:
1. Rename `depositAda` → `minAdaRequirement` in `FeeBreakdown` type and all references
2. For live adapters where `networkFeeAda` is 0 (API handles it), add a comment: `// Network fees handled server-side by aggregator API`
3. In UI, add a note when comparing live vs mock routes: "Live routes may not include network fees in the displayed total"

**Verification**: TypeScript compiles, all tests pass, UI shows fee breakdown without misleading comparisons

### Gate Check for Phase 1:
- [ ] Identical net-output from both paths for same inputs
- [ ] Non-ADA input assets produce correct net output
- [ ] `depositAda` renamed globally

---

## Phase 2: Runtime Safety + Architecture Modernization (HIGH)

**Goal**: Replace the fragile async state management with production-grade patterns. This phase delivers the biggest architectural win — it fixes RACE-1, RACE-2, LEAK-1, and SM-1/2 all at once.

### Fix 2.0: Replace inline state machine with useReducer pipeline

**Files**: New `src/hooks/useSwapExecution.ts`, `src/domain/executionMachine.ts`

**What to do**:
1. Create `src/domain/executionMachine.ts` with the `SwapState`, `SwapAction`, `TRANSITIONS`, and `swapReducer` from Decision 1 above
2. Create `src/hooks/useSwapExecution.ts`:
```ts
export function useSwapExecution(walletApi: Cip30WalletApi | null, request: QuoteRequest) {
  const [state, dispatch] = useReducer(swapReducer, { step: "preview_ready" });
  const isExecuting = useRef(false);

  // Effect: handle async steps
  useEffect(() => {
    if (state.step === "refreshing_quote") refreshQuoteAndCompare();
    if (state.step === "signing") signTx();
    if (state.step === "tracking" && "txHash" in state) trackTx(state.txHash);
  }, [state.step]);

  const execute = useCallback(() => {
    if (isExecuting.current) return; // RACE-1: double-click guard
    isExecuting.current = true;
    dispatch({ type: "START_REFRESH" });
  }, []);

  const reset = useCallback(() => {
    isExecuting.current = false;
    dispatch({ type: "RESET" });
  }, []);

  return { state, execute, reset };
}
```
3. In main.tsx: replace all 11 `setExecutionState` calls + the `handleExecuteSwap` async function with `const { state: execState, execute, reset } = useSwapExecution(walletApiRef.current, request)`
4. Update button onClick from inline handler to just `execute()`
5. Update button text/label logic to use `execState.step` (already discriminated — TypeScript enforces correct field access)

**What this fixes**: RACE-1 (double-click), SM-1 (retry button), SM-2 (dead awaiting_signature state), and eliminates 100+ lines of async spaghetti.

### Fix 2.1: Replace useEffect-based quote fetching with React Query

**Files**: New `src/hooks/useLiveQuotes.ts`

**What to do**:
1. `npm install @tanstack/react-query`
2. Create `src/hooks/useLiveQuotes.ts` with the pattern from Decision 2 above
3. In main.tsx: replace the 40-line `useEffect` (lines 178-227) with:
```tsx
const { data: liveResults = [], isLoading, isError, error } = useLiveQuotes(request);
```
4. Wrap App in `QueryClientProvider`:
```tsx
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 0, refetchOnWindowFocus: false } }
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
);
```
5. Remove the `LiveQuoteState` type, `cancelled` flag, and manual `Promise.allSettled` wrapper

**What this fixes**: RACE-2 (auto-abort via signal), eliminates manual AbortController management, reduces main.tsx by ~50 lines.

**Bundle impact**: ~12-15KB gzipped added. The reduction in main.tsx compensates — net ~0 change in bundle size.

### Fix 2.2: LEAK-1 — Clean up setTimeout in wallet discovery

**Files**: `src/main.tsx:247-253`

**What to do**:
1. Store timeout ID: `const timeoutId = globalThis.setTimeout(discoverAndSetWallets, 1_000)`
2. In cleanup: `globalThis.clearTimeout(timeoutId)`
3. Also wrap `discoverAndSetWallets` calls with a mounted check if needed

### Fix 2.4: RACE-1 + SM-1 — Already fixed by useReducer (Fix 2.0)

The pipeline-based state machine with `isExecuting` ref makes double-click impossible. The `RESET` action allows retry from any terminal state.

### Fix 2.5: RACE-2 — Already fixed by React Query (Fix 2.1)

React Query's `queryKey` change automatically aborts the previous query's `signal`. No manual AbortController needed.

### Fix 2.6: RISK-2 — Mainnet lock bypass

**Files**: `src/main.tsx:322`

**What to do**:
1. Change `route.source.quoteMode === "mock"` → `request.network !== "mainnet"`
2. Add explicit early return: `if (request.network === "mainnet") { setExecutionState({ step: "failed", error: "Mainnet execution is locked." }); return; }`

### Fix 2.7: RISK-3 + SEC-1 — Add React error boundary

**Files**: `src/main.tsx` (new component)

**What to do**:
1. Create `src/components/ErrorBoundary.tsx` with `componentDidCatch`
2. Wrap `<App />` in the error boundary
3. Display a user-friendly fallback UI with "Something went wrong" and a retry button

### Gate Check for Phase 2:
- [ ] Rapid double-click does not trigger concurrent execution (verified by `isExecuting` ref)
- [ ] Changing token pair aborts in-flight quote fetches (React Query auto-abort)
- [ ] Timeout cleaned up on unmount (React dev warnings clean)
- [ ] Mainnet execution blocked at network level (not quote mode)
- [ ] Error boundary catches `requireAsset` throws
- [ ] "Retry swap" works from failed/expired/submitted/confirmed states (RESET action)
- [ ] main.tsx reduced from ~600 lines to ~250 lines

---

## Phase 3: Test Coverage (HIGH — Must Fix Before Production)

### Fix 3.1: TG-1 — Add tests for minswapBuildTx.ts

**Files**: `src/adapters/minswapBuildTx.test.ts`

**What to do**:
1. Test `buildUnsignedTx` success path (mock fetch returning valid CBOR)
2. Test `buildUnsignedTx` HTTP 400/500 error paths
3. Test `buildUnsignedTx` malformed response (missing CBOR)
4. Test `buildUnsignedTx` network timeout
5. Test `submitSignedTx` success path
6. Test `submitSignedTx` error paths
7. Test `buildTxRequestFromQuote` produces correct request shape

**Target**: 80%+ line coverage (currently 50%)

### Fix 3.2: TG-3 — Add tests for direct-pool adapters

**Files**: New `src/adapters/minswapV2DirectPoolAdapter.test.ts`, `src/adapters/sundaeSwapV3DirectPoolAdapter.test.ts`

**What to do**:
1. Mock pool metrics API responses
2. Test ADA→SNEK quote produces reasonable output
3. Test zero/negative reserve handling
4. Test HTTP error from pool API
5. Verify `computeSwapPriceImpactPct` called with correct arguments (regression for BUG-1)

### Fix 3.3: TG-4 — Add tests for Steelswap, Cardexscan, SaturnSwap

**Files**: Existing test files

**What to do**: Add fixture-based normalization tests (like the existing `minswapLiveAdapter` tests) for each adapter. Mock the HTTP layer, test the normalization logic.

### Fix 3.4: TG-5 — Fix weak price impact test

**Files**: `src/domain/amm.test.ts:40,44`

**What to do**: Replace `expect(impact).toBeGreaterThan(0)` with `expect(impact).toBeCloseTo(34.48, 1)` for known inputs.

### Fix 3.5: L4-2 + L4-5 — Add coverage threshold and missing dep

**Files**: `vitest.config.ts`, `package.json`

**What to do**:
1. Add `@vitest/coverage-v8` to `devDependencies` (already installed, just formalize)
2. Add coverage thresholds to `vitest.config.ts`:
```ts
coverage: {
  thresholds: {
    lines: 80,
    branches: 75,
    functions: 85,
    statements: 80,
  }
}
```

### Fix 3.6: PBT-1..PBT-6 — Add property-based tests with fast-check

**Files**: New `src/domain/amm.property.test.ts`, `src/domain/quoteEngine.property.test.ts`, `test/arbitraries.ts`

**What to do**:
1. `npm install -D fast-check`
2. Create `test/arbitraries.ts` with shared generators:
```ts
import * as fc from "fast-check";

export const poolStateArb = fc.record({
  reserveIn: fc.double({ min: 1, max: 1_000_000_000 }),
  reserveOut: fc.double({ min: 1, max: 1_000_000_000 }),
  feeBps: fc.integer({ min: 0, max: 10000 }),
});

export const positiveInput = fc.double({ min: 0.000001, max: 1_000_000 });

export const feeBreakdownArb = fc.record({
  dexFeeAda: fc.double({ min: 0, max: 100 }),
  batcherFeeAda: fc.double({ min: 0, max: 5 }),
  networkFeeAda: fc.double({ min: 0, max: 1 }),
  aggregatorFeeAda: fc.double({ min: 0, max: 5 }),
  depositAda: fc.double({ min: 0, max: 3 }),
});
```
3. Create `src/domain/amm.property.test.ts` with k-invariant, output ≤ reserveOut, zero-input, and allocation-sum tests (see Decision 4 for full code)
4. Create `src/domain/quoteEngine.property.test.ts`:
   - `netOutputForCandidate`: `netOutput ≤ grossOutput` for all non-negative fee inputs
   - `decideRoutes`: `selectedRoute` never appears in `rejectedRoutes`
   - `comparePreviewToRefreshedRoute`: comparing a preview to itself always returns `{ status: "match" }`
5. Add `"test:property": "vitest run --config vitest.config.ts src/domain/*.property.test.ts"` to package.json
6. Run with `numRuns: 10_000` in CI to catch rare edge cases: `fc.assert(fc.property(...), { numRuns: 10_000 })`

**Key advantage**: fast-check's built-in **shrinking** finds the minimal failing case automatically. If `reserveIn: 987,654,321` triggers a k-invariant violation, the shrinker reduces it to (e.g.) `reserveIn: 2` — the smallest input that fails — making debugging trivial.

### Fix 3.7: Run Stryker mutation testing to validate test quality

**Files**: New `stryker.config.json`

**What to do**:
1. `npm install -D @stryker-mutator/core @stryker-mutator/vitest-runner`
2. Create `stryker.config.json`:
```json
{
  "$schema": "https://raw.githubusercontent.com/stryker-mutator/stryker-js/master/packages/core/schema/stryker-schema.json",
  "testRunner": "vitest",
  "vitest": { "configFile": "vitest.config.ts" },
  "coverageAnalysis": "perTest",
  "mutate": ["src/domain/**/*.ts", "!src/domain/**/*.test.ts", "!src/domain/**/*.property.test.ts"],
  "thresholds": { "high": 85, "low": 70, "break": 60 }
}
```
3. Run `npx stryker run` — for a 3,500-line codebase this completes in **~5-10 minutes**
4. Review the report: any "survived" mutant means a test gap. Prioritize fixing mutants in `amm.ts` and `quoteEngine.ts`

**What Stryker catches**: If a test passes despite a bug being injected (e.g., changing `*` to `/` in `constantProductSwap`), Stryker flags it. This catches the exact class of bug that BUG-1 (wrong price impact) and BUG-3 (formula mismatch) represent.

### Gate Check for Phase 3:
- [ ] `npm test` passes with 85%+ branch coverage
- [ ] `vitest --coverage` shows no files below 80% lines
- [ ] Property tests verify all 6 invariants

---

## Phase 4: React Performance & UX (MEDIUM)

### Fix 4.1: PERF-1 + PERF-2 — Memoize route decisions

**Files**: `src/main.tsx:328,334`

**What to do**:
1. Wrap `buildDecision(...)` call in `useMemo`:
```tsx
const decision = React.useMemo(
  () => buildDecision(request, liveQuote.results, Number(improvementBuffer)),
  [request, liveQuote.results, improvementBuffer]
);
```
2. Wrap `createTransactionPreview(...)` in `useMemo`:
```tsx
const transactionPreview = React.useMemo(
  () => createTransactionPreview(decision, toPreviewWalletContext(walletContext)),
  [decision, walletContext]
);
```
3. Wrap `computeAdapterHealth(...)` in `useMemo`

### Fix 4.2: SM-1 + Error Recovery UX — Retry, reset, and localStorage persistence

**Files**: `src/main.tsx`, new `src/hooks/useTxPersistence.ts`

**What to do**:
1. Already fixed by useReducer `RESET` action (Fix 2.0) — retry works from any terminal state
2. Add human-readable error mapping for swap failures:
```ts
const ERROR_LABELS: Record<string, string> = {
  "slippage_exceeded": "Price moved too much. Try increasing slippage tolerance.",
  "insufficient_funds": "Not enough tokens. Top up your wallet and try again.",
  "user_rejected": "You rejected the signature. Try again when ready.",
  "network_error": "Network request failed. Check your connection.",
  "timeout": "Request timed out. The network might be congested.",
};
```
3. On `comparePreviewToRefreshedRoute` blocking due to stale quote, **auto-trigger a fresh quote fetch** instead of just showing the error (production dApp pattern)
4. Create `src/hooks/useTxPersistence.ts`:
```ts
// Persist submitted tx hashes to localStorage (keyed by wallet address)
// so transaction tracking survives page refreshes
export function useTxPersistence(walletAddress: string | undefined) {
  const key = `clearoute_txs_${walletAddress ?? "anonymous"}`;
  
  const saveTx = (txHash: string) => {
    const txs = JSON.parse(localStorage.getItem(key) ?? "[]");
    txs.push({ txHash, timestamp: Date.now() });
    localStorage.setItem(key, JSON.stringify(txs.slice(-10))); // Keep last 10
  };
  
  const getRecentTxs = () => JSON.parse(localStorage.getItem(key) ?? "[]");
  
  return { saveTx, getRecentTxs };
}
```
5. Wire `saveTx(txHash)` on TX_SUBMITTED dispatch

### Fix 4.3: SM-2 — Fix mock execution awaiting_signature rendering

**Files**: `src/main.tsx` (or `src/hooks/useSwapExecution.ts`)

**What to do**: The useReducer + useEffect pattern naturally separates state transitions with render cycles. Remove the `setTimeout` hack from the old code — the `awaiting_signature` → `signing` transition now renders properly because React processes each dispatch in a separate render:
```ts
// In the effect handler for "refreshing_quote":
await compareRefresh();
dispatch({ type: "START_BUILD" });
// ... build tx ...
dispatch({ type: "START_SIGN" }); // This renders "awaiting_signature"
// ... brief intentional delay for UX ...
await new Promise(r => setTimeout(r, 300));
// ... sign ...
dispatch({ type: "START_SUBMIT" }); // This renders "signing"
```

### Gate Check for Phase 4:
- [ ] React DevTools Profiler shows no unnecessary re-renders from route calculation
- [ ] "Retry swap" button works from failed/expired/submitted/confirmed states
- [ ] Mock execution shows all intermediate states

---

## Phase 5: Code Quality & CI (MEDIUM)

### Fix 5.1: CQ-3 — Network gating consistency

**Files**: `src/adapters/minswapV2DirectPoolAdapter.ts`, `src/adapters/sundaeSwapV3DirectPoolAdapter.ts`

**What to do**: Change both adapters to return structured failures instead of `[]` when network doesn't match, consistent with other adapters:
```ts
return [failure(request, "unsupported_pair", "Direct pool quotes use mainnet market data only.")];
```

### Fix 5.2: CC-1 — Refactor decideRoutes (complexity 24)

**Files**: `src/domain/quoteEngine.ts`

**What to do**: Extract the validation pipeline into composable guard functions:
```ts
const GUARDS = [checkPairMatch, checkNetworkMatch, checkStaleness, checkLiquidity, checkPriceImpact, checkExecutability];
for (const guard of GUARDS) {
  const result = guard(candidate, request, now, options);
  if (result) { rejected.push(result); continue; }
}
```

### Fix 5.3: CC-2 — Extract tracking callback from handleExecuteSwap

**Files**: `src/main.tsx:396-413`

**What to do**: Extract the inline tracking callback to a named function:
```ts
function createTrackingCallback(setExecutionState: ...): TxUpdateCallback { ... }
```

### Fix 5.4: CI-1 — Fix CI workflow

**Files**: `.github/workflows/ci.yml`

**What to do**: After Phase 0 fixes, verify CI passes. Also:
1. Add `npx oxlint --max-warnings 0 src/` step
2. Add coverage check step: `npx vitest run --coverage`
3. Change `test:e2e` to use `test:e2e:dev` temporarily if build is still being fixed

### Fix 5.5: LINT-2 — Add ESLint config

**Files**: New `eslint.config.js`

**What to do**:
1. Create `eslint.config.js` with TypeScript, React, and React Hooks plugins
2. Add `"lint": "eslint src/"` to package.json scripts
3. Fix any existing lint warnings

### Fix 5.6: BUNDLE-3 + L5-4 — Move build tools to devDependencies

**Files**: `package.json`

**What to do**: Move `@vitejs/plugin-react`, `typescript`, `vite` from `dependencies` to `devDependencies`

### Fix 5.7: L5-2 — Add private flag

**Files**: `package.json`

**What to do**: Add `"private": true` to package.json

### Gate Check for Phase 5:
- [ ] CI workflow passes on push
- [ ] `npm run lint` passes with 0 errors
- [ ] All adapters return consistent failure formats

---

## Phase 6: Protocol & Wallet Correctness (MEDIUM)

### Fix 6.1: CIP30-1 + PROTO-2 — Fix signTx partialSign

**Files**: `src/main.tsx:313`

**What to do**: Change `api.signTx(buildResult.cbor, false)` → `api.signTx(buildResult.cbor, true)` for DEX contract transactions

### Fix 6.2: PROTO-3 — Network ID guard

**Files**: `src/wallet/cip30.ts:218`

**What to do**: Add explicit rejection for unknown network IDs:
```ts
function networkName(networkId: number): "mainnet" | "testnet" {
  if (networkId === 0) return "testnet";
  if (networkId === 1) return "mainnet";
  throw new Error(`Unsupported network ID: ${networkId}`);
}
```
Then in `connectWallet`, catch this and return `wrong_network` error.

### Fix 6.3: PROTO-4 — CBOR empty string guard

**Files**: `src/wallet/cip30.ts:95`

**What to do**: Add early return/throw for empty hex:
```ts
if (hex.length === 0) throw new Error("Empty hex string.");
```

### Fix 6.4: NUM-1 — Safe bigint formatting

**Files**: `src/main.tsx:115`

**What to do**: For quantities exceeding `Number.MAX_SAFE_INTEGER / (10 ** decimals)`, display as string instead of formatting:
```ts
const safeMax = Number.MAX_SAFE_INTEGER / divisor;
if (Number(quantity) > safeMax) {
  return `${quantity.toString()} (raw) ${asset.symbol}`;
}
```

### Fix 6.5: TK-1 — Replace HOSKY placeholder

**Files**: `src/domain/assets.ts:34`

**What to do**: Either:
- Replace with real HOSKY asset ID: `a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59`
- Or remove HOSKY from `selectableSymbols` and add a comment explaining it's unavailable

### Fix 6.6: TK-3 — Add pair gating metadata to adapters

**Files**: `src/adapters/types.ts`, all adapter files

**What to do**: Add optional `supportedPairs?: { inputAssetId: string; outputAssetId: string }[]` to `QuoteAdapterSuccess` or adapter config. In the UI, show which adapters support the current pair.

### Gate Check for Phase 6:
- [ ] `signTx` uses `partialSign: true`
- [ ] Unknown network IDs rejected with clear error
- [ ] HOSKY uses real asset ID or is removed
- [ ] No bigint→Number precision loss in balance display

---

## Phase 7: Polish, Accessibility & Documentation (LOW)

### Fix 7.1: A11Y-1 — Add :focus-visible styles

**Files**: `src/styles.css`

**What to do**: Add at the end of the button block:
```css
button:focus-visible {
  outline: 2px solid #0b63ce;
  outline-offset: 2px;
}
```

### Fix 7.2: A11Y-2 — prefers-reduced-motion

**Files**: `src/styles.css`

**What to do**: Add:
```css
@media (prefers-reduced-motion: reduce) {
  .spin { animation: none; }
}
```

### Fix 7.3: A11Y-5 — Color + shape status indicators

**Files**: `src/styles.css`

**What to do**: Add text labels next to health dots or use shape indicators (circle vs triangle):
```css
.healthDot.available::before { content: "●"; }
.healthDot.failed::before { content: "▲"; }
```

### Fix 7.4: DOC-1 — Add JSDoc to exported functions

**Files**: All `src/domain/*.ts`, `src/adapters/types.ts`

**What to do**: Add `@param`, `@returns`, `@throws` JSDoc to all exported functions. Prioritize:
1. `decideRoutes`
2. `netOutputForCandidate`
3. `comparePreviewToRefreshedRoute`
4. `parseBalanceCbor`
5. `connectWallet`
6. `constantProductSwap`
7. All adapter `getQuotes` methods

### Fix 7.5: DOC-2 — Fix README false claims

**Files**: `README.md`

**What to do**:
1. Change "npm run build passes" → "Build status: see CI badge" or remove
2. Change "Minswap preprod executable swap" → "Mock executable swap on preprod (real API unavailable)"
3. Change "All 55 tickets pass code review" → remove or qualify

### Fix 7.6: DOC-3 — Link adapter research

**Files**: `README.md`, `docs/ARCHITECTURE.md`

**What to do**: Add a "Research" section to README pointing to `src/adapters/README-*.md` (or move them to `docs/research/`)

### Fix 7.7: CQ-5 — Move READMEs out of src/

**Files**: 5 README files

**What to do**: Move `src/adapters/README-*.md` → `docs/research/`

### Fix 7.8: SEC-4 — Add CSP headers

**Files**: `index.html` or new `vite.config.ts`

**What to do**: Add CSP meta tag as recommended in `docs/SECURITY-REVIEW.md`

### Fix 7.9: PC-6 — Add ESLint + Prettier configs

**Files**: New config files

**What to do**: Create `.prettierrc`, `.editorconfig`, and `eslint.config.js`. Add format script.

### Fix 7.10: Dead code cleanup

**Files**: Multiple

**What to do**:
1. Remove unused `constantProductSpotPrice` export (or mark @internal)
2. Share `LOVELACE` constant from `assets.ts` instead of duplicating
3. Remove `STEELSWAP_ADA_ID` and `CARDEXSCAN_ADA_ID` (use `LOVELACE_ASSET_ID`)
4. Remove unused `outputs` parameter from `computeSplitFees` signature
5. Remove PC-9: dead `"stale"` health status code path

### Gate Check for Phase 7:
- [ ] Keyboard navigation shows visible focus indicators
- [ ] Reduced motion users see no spinning animations
- [ ] All exported functions have JSDoc
- [ ] README accurately reflects current state
- [ ] No dead code or unused exports remain

---

## Dependency Graph

```
Phase 0 (Build) ─────────────────────────────────────────┐
     │                                                     │
     ├── Phase 1 (Data Integrity) ────────────────────────┤
     │        │                                            │
     │        ├── Phase 3 (Test Coverage) ────────────────┤
     │        │        │                                   │
     │        │        └── Phase 5 (Code Quality) ────────┤
     │        │                 │                          │
     ├── Phase 2 (Runtime Safety) ─┐                      │
     │        │                    ├── Phase 7 (Polish) ──┤
     │        │                    │                      │
     │        └── Phase 4 (React Perf) ───────────────────┤
     │                                                     │
     └── Phase 6 (Protocol/Wallet) ───────────────────────┘
```

Phases can be parallelized as: 0 → {1, 2, 6} → {3, 4} → 5 → 7

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| Phase 0 deduplication breaks an adapter | Run `npm test` after each file change |
| PROTO-1 fix changes mock adapter behavior | Verify mock adapter tests still pass |
| Coverage threshold blocks CI | Start with lower threshold (70%) and ratchet up |
| `partialSign: true` causes wallet rejections | Test against Lace/Eternl on preprod first |
| ESLint finds many new warnings | Use `--fix` for auto-fixable, triage rest |

---

## Success Criteria

After all phases are complete:

1. `npm run build` passes with zero errors
2. `npm test` passes with 85%+ branch coverage
3. `npm run lint` passes with zero warnings
4. CI pipeline is green (build → test → lint → coverage → e2e)
5. All 6 CRITICAL and 8 HIGH findings are resolved
6. No known race conditions or memory leaks
7. Mainnet execution is properly locked at the network level
8. Cardano protocol parameters (decimals, fees, partialSign) are correct
9. WCAG 2.1 AA accessibility baseline met
10. All exported functions have JSDoc documentation
