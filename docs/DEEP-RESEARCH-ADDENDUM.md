# Deep Research Addendum — Decisions 10-17

*Research conducted June 12, 2026. Extends `docs/IMPLEMENTATION-PLAN.md` with 8 additional strategic decisions from Level-8 and Level-9 deep research.*

---

## Decision 10: Observability with structured event telemetry

**Research source**: Production DeFi dApp monitoring patterns (Uniswap, Jupiter, 1inch).

**What this means for ClearRoute**: Currently zero instrumentation. Errors are caught silently or shown as raw strings. No way to measure adapter health, quote latency, or conversion funnels in production.

### Swap Funnel Metrics to Track

```
Visit -> Initiate Quote -> View Quote -> Click Swap -> Wallet Sign -> Transaction Confirmed
   |         |               |             |             |              |
  Page    time-to-     route table    button       signature     Blockfrost
  load    first-quote   renders        click        duration      confirms
```

**Key metrics per adapter**: P50/P95 quote latency, success/failure rate, circuit breaker trip count, HTTP error categorization (4xx vs 5xx vs timeout).

### Concrete Implementation

**Structured event logger** (new file: `src/telemetry/logger.ts`):

```ts
type EventSeverity = "info" | "warn" | "error";

type TelemetryEvent = {
  name: string;
  severity: EventSeverity;
  timestamp: string;
  sessionId: string;
  adapterId?: string;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
};

class Telemetry {
  private sessionId = crypto.randomUUID();
  private events: TelemetryEvent[] = [];

  track(name: string, opts: {
    severity?: EventSeverity;
    adapterId?: string;
    durationMs?: number;
    error?: string;
    metadata?: Record<string, unknown>;
  } = {}) {
    const event: TelemetryEvent = {
      name,
      severity: opts.severity ?? "info",
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      ...opts,
    };
    this.events.push(event);
    if (opts.severity === "error") {
      console.error("[telemetry]", event);
    }
  }

  trackQuoteRequested(adapterId: string) { this.track("quote_requested", { adapterId }); }
  trackQuoteReceived(adapterId: string, durationMs: number) { this.track("quote_received", { adapterId, durationMs }); }
  trackQuoteFailed(adapterId: string, error: string) { this.track("quote_failed", { severity: "error", adapterId, error }); }
  trackSwapStarted() { this.track("swap_started"); }
  trackSwapConfirmed(durationMs: number) { this.track("swap_confirmed", { durationMs }); }
  trackSwapFailed(error: string) { this.track("swap_failed", { severity: "error", error }); }
  trackAdapterHealth(adapterId: string, healthy: boolean, latencyMs?: number) {
    this.track("adapter_health", { adapterId, metadata: { healthy, latencyMs } });
  }
}

export const telemetry = new Telemetry();
```

**Wire into BaseDexAdapter** (Decision 7): In `BaseDexAdapter.getQuotes()`, add `telemetry.trackQuoteRequested()` before fetch, `trackQuoteReceived()` on success, `trackQuoteFailed()` on error.

**Timing**: Phase 5 (alongside adapter standardization)

---

## Decision 11: PWA for instant loads and transaction notifications

**Research source**: PWA patterns for crypto dApps. Major DEXs are web-first, not PWA-first, but for a smaller dApp PWA provides native-like experience with minimal effort.

### What's Worth Implementing

| Feature | Value | Effort |
|---------|-------|--------|
| App Shell caching | Instant loads on repeat visits | Low (1 file) |
| Offline fallback page | No blank screen when offline | Low (1 file) |
| Web Push for tx confirmations | Notify user when swap confirms | Medium (needs backend) |
| Background sync for tx submission | Retry failed submissions | Medium |
| Install prompt | "Add to Home Screen" | Low (manifest.json) |

### Concrete Implementation

**Service worker** (new file: `public/sw.js`): Cache-first for app shell (HTML/CSS/JS), network-first for live quote APIs. Never serve stale prices from cache.

**Registration** (add to `src/main.tsx`): `navigator.serviceWorker.register("/sw.js")` on load.

**manifest.json** (new file: `public/manifest.json`): Define app name, icons, background/theme colors, standalone display mode.

**Bundle impact**: ~2KB for service worker + manifest. Zero runtime cost.

**Timing**: Phase 7 (polish)

---

## Decision 12: Multi-network architecture with read-only mainnet mode

**Research source**: Minswap, SundaeSwap, Mesh SDK multi-network patterns. CIP-30 limitation: wallets can't distinguish preprod from preview (both return `networkId: 0`).

### Current State vs Target

| Aspect | Current | Target |
|--------|---------|--------|
| Network detection | `networkId === 0 ? testnet : mainnet` | Manual selector + wallet validation |
| Preprod vs Preview | Ambiguous | Manual selection with warning |
| Mainnet execution | Guarded by `quoteMode === "mock"` | Network-level lock + UI banner |
| Config per network | Scattered constants | Centralized `NETWORK_CONFIG` map |

### Concrete Implementation

**Network configuration map** (new file: `src/config/networkConfig.ts`): `Record<"mainnet"|"preprod"|"preview", { blockfrostBaseUrl, minswapApiBase, explorerUrl, executable, label }>`. Mainnet has `executable: false` (read-only lock). Preprod and preview have `executable: true`.

**Network selector UX**: Manual dropdown in header. When wallet connects, validate that wallet network matches selected network. If mismatch, show warning. Swap button disabled unless `NETWORK_CONFIG[selectedNetwork].executable` is true.

**What this eliminates**: CIP30-2 ambiguity, RISK-2 (mainnet lock at network level), scattered network constants.

**Timing**: Phase 6 (alongside protocol & wallet fixes)

---

## Decision 13: Performance budgets with Lighthouse CI

**Research source**: Core Web Vitals targets for DEX interfaces. **INP (Interaction to Next Paint) is the north star** -- users forgive slow loads but not laggy buttons.

### Core Web Vitals Targets

| Metric | Target | Why it matters |
|--------|--------|----------------|
| LCP | < 2.5s | Swap input card should paint fast |
| INP | < 200ms | "Confirm and swap" must feel instant |
| CLS | < 0.1 | Price updates must not shift layout |

### Concrete Implementation

- **Lighthouse CI config** (`lighthouserc.js`): Assert performance >= 0.85, FCP < 2000ms, total-byte-weight < 300KB
- **CI integration**: Add `lhci autorun` step to GitHub Actions
- **Bundle budget** (`vite.config.ts`): `chunkSizeWarningLimit: 250`, manualChunks for vendor/icons

**Timing**: Phase 5 (alongside CI fixes)

---

## Decision 14: Web Worker offloading for heavy computation (NEW - Level 9)

**Research source**: Web Worker patterns with Comlink, Vite native Worker support, 50ms jank threshold.

**What this means for ClearRoute**: `decideRoutes` (complexity 24) and `computeOptimalSplit` (O(n*steps)) both run on the main thread during render. For large inputs, this causes jank. Offloading to a Web Worker keeps the UI responsive.

### Is it worth it?

The 50ms threshold: if computation takes >50ms, offload to Worker. Under 50ms, keep on main thread (serialization overhead outweighs benefit).

For ClearRoute:
- `decideRoutes` with 20+ candidates: likely >50ms -> worth offloading
- `computeOptimalSplit` with 2000 steps x 5 pools: likely >50ms -> worth offloading
- Simple formatting/validation: stay on main thread

### Concrete Implementation

**Using Comlink for clean async API** (new file: `src/workers/routeWorker.ts`):

```ts
import * as Comlink from "comlink";
import { decideRoutes } from "../domain/quoteEngine";
import { computeOptimalSplit } from "../domain/amm";
import type { QuoteRequest, RouteCandidate, RouteDecision } from "../domain/routes";
import type { PoolState } from "../domain/amm";

const routeEngine = {
  rankRoutes(request: QuoteRequest, candidates: RouteCandidate[]): RouteDecision {
    return decideRoutes(request, candidates);
  },
  
  optimalSplit(totalInput: number, pools: PoolState[]) {
    return computeOptimalSplit(totalInput, pools);
  },
};

Comlink.expose(routeEngine);
```

**Main thread usage** (in `useRouteDecision` hook):

```ts
// src/hooks/useRouteDecision.ts
import * as Comlink from "comlink";
import type { routeEngine } from "../workers/routeWorker";

const worker = new Worker(
  new URL("../workers/routeWorker.ts", import.meta.url),
  { type: "module" }
);
const engine = Comlink.wrap<typeof routeEngine>(worker);

export function useRouteDecision(request, candidates) {
  const [decision, setDecision] = useState(null);
  
  useEffect(() => {
    let cancelled = false;
    engine.rankRoutes(request, candidates).then(result => {
      if (!cancelled) setDecision(result);
    });
    return () => { cancelled = true; };
  }, [request, candidates]);
  
  return decision;
}
```

**Fallback pattern**: If Worker isn't supported, run synchronously on main thread.

```ts
const isWorkerSupported = typeof Worker !== "undefined";
const engine = isWorkerSupported 
  ? Comlink.wrap<typeof routeEngine>(new Worker(...))
  : { rankRoutes: decideRoutes, optimalSplit: computeOptimalSplit };
```

**Bundle impact**: +5KB (Comlink + worker file). Worker is a separate chunk that doesn't block initial load.

**Timing**: Phase 5 (alongside code splitting -- the worker pattern pairs naturally with dynamic imports)

---

## Decision 15: Accessibility with ARIA live regions and axe-core CI (NEW - Level 9)

**Research source**: WCAG 2.2 AA requirements for financial interfaces, production dApp accessibility patterns.

**What this means for ClearRoute**: The audit found 5 accessibility issues (A11Y-1 through A11Y-5). This decision adds production-grade accessibility: screen reader announcements for async state changes, focus management, and automated CI testing.

### ARIA Live Region Strategy

| Async Event | ARIA Pattern | Message Example |
|-------------|-------------|-----------------|
| Quote loading | `role="status"` (polite) | "Fetching live quotes..." |
| Quote ready | `role="status"` (polite) | "Quote ready: 460 SNEK for 100 ADA" |
| Swap building | `role="status"` (polite) | "Building transaction..." |
| Swap signing | `role="status"` (polite) | "Awaiting wallet signature" |
| Swap submitted | `role="status"` (polite) | "Transaction submitted. Tracking..." |
| Swap confirmed | `role="status"` (polite) | "Swap confirmed successfully" |
| Swap failed | `role="alert"` (assertive) | "Swap failed: slippage exceeded" |

### Concrete Implementation

**Announcer component** (new file: `src/components/Announcer.tsx`):

```tsx
// Centralized aria-live region that all components use
export function Announcer() {
  return (
    <div
      id="announcer"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "absolute",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
        whiteSpace: "nowrap",
      }}
    />
  );
}

// Hook for any component to announce messages
export function useAnnounce() {
  return (message: string, assertive = false) => {
    const el = document.getElementById("announcer");
    if (!el) return;
    el.setAttribute("aria-live", assertive ? "assertive" : "polite");
    el.textContent = ""; // Clear first to re-trigger announcement
    requestAnimationFrame(() => { el.textContent = message; });
  };
}
```

**Wire into swap execution** (in `useSwapExecution` effect handlers):

```ts
const announce = useAnnounce();
// ...
case "refreshing_quote": announce("Refreshing quote..."); break;
case "awaiting_signature": announce("Awaiting wallet signature"); break;
case "confirmed": announce("Swap confirmed successfully"); break;
case "failed": announce(`Swap failed: ${state.error}`, true); break; // assertive
```

### Minimum Viable Accessibility Checklist (WCAG 2.2 AA)

1. Semantic HTML: use native `<button>`, `<a>`, `<form>` -- no div-as-button
2. Focus visible: `:focus-visible` styles on all interactive elements (A11Y-1)
3. Live regions: all async state changes announced (this decision)
4. Color contrast: text-to-background ratio >= 4.5:1
5. Target size: minimum 24x24 CSS pixels for clickable elements
6. Keyboard traps: no component traps focus without Escape exit
7. Alt text: every icon/token image has descriptive alt text
8. Reduced motion: `prefers-reduced-motion` respected (A11Y-2)

### CI Integration

```yaml
# In .github/workflows/ci.yml:
- name: Accessibility audit
  run: |
    npx axe-cli http://localhost:5173 --exit
```

**Timing**: Phase 7 (polish -- alongside existing A11Y fixes)

---

## Decision 16: API key security via backend proxy (NEW - Level 9)

**Research source**: Blockfrost official documentation (explicitly says "never expose keys client-side"), production dApp patterns (Minswap/SundaeSwap use BFF architecture).

**What this means for ClearRoute**: Currently 5 API keys are exposed in the browser bundle via `VITE_*` env vars. Blockfrost, DexHunter, Steelswap, Cardexscan, and Saturn API keys are all inlined at build time and visible to anyone who inspects the bundle.

### The Problem

- `VITE_BLOCKFROST_PROJECT_ID` -- exposed
- `VITE_DEXHUNTER_API_KEY` -- exposed
- `VITE_STEELSWAP_API_KEY` -- exposed
- `VITE_CARDEXSCAN_API_KEY` -- exposed
- `VITE_SATURN_API_KEY` -- exposed

Anyone can extract these, use them to exhaust rate limits, or abuse the project's quota.

### The Solution: Vite proxy for development, serverless functions for production

**Phase 1 (now): Vite dev proxy** -- for development only, route API calls through Vite's dev server:

```ts
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      "/api/blockfrost": {
        target: "https://cardano-mainnet.blockfrost.io/api/v0",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/blockfrost/, ""),
        headers: {
          project_id: process.env.BLOCKFROST_PROJECT_ID!,
        },
      },
      "/api/minswap": {
        target: "https://api.minswap.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/minswap/, ""),
      },
      // ... same pattern for DexHunter, Steelswap, Cardexscan, Saturn
    },
  },
});
```

**Phase 2 (production): Serverless proxy** -- deploy a thin proxy layer:

```ts
// api/proxy.ts (Vercel/Netlify serverless function)
export async function handler(req: Request) {
  const url = new URL(req.url);
  const target = url.searchParams.get("target"); // e.g., "blockfrost"
  const path = url.searchParams.get("path");     // e.g., "/txs/abc123"
  
  const TARGETS: Record<string, { url: string; key: string }> = {
    blockfrost: { url: "https://cardano-mainnet.blockfrost.io/api/v0", key: process.env.BLOCKFROST_KEY! },
    minswap: { url: "https://api.minswap.org", key: "" },
    // ... others
  };
  
  const config = TARGETS[target!];
  if (!config) return new Response("Unknown target", { status: 400 });
  
  const res = await fetch(`${config.url}${path}`, {
    headers: config.key ? { project_id: config.key } : {},
  });
  
  return new Response(res.body, { status: res.status, headers: { "Content-Type": "application/json" } });
}
```

**Phase 3 (future): "Bring your own key"** -- allow power users to input their own Blockfrost project ID in settings. This completely eliminates the dApp's dependency on shared API keys.

### What changes in the codebase

1. Adapters call `/api/proxy?target=blockfrost&path=/txs/...` instead of `https://cardano-mainnet.blockfrost.io/api/v0/txs/...`
2. All 5 `VITE_*` env vars are removed from the browser bundle
3. API keys move to server-side environment variables only
4. `.env.example` updated to document server-side keys, not `VITE_` keys

**Timing**: Phase 5 (alongside adapter standardization -- proxy pattern pairs with BaseDexAdapter)

---

## Decision 17: Graceful degradation and fallback UX (NEW - Level 9)

**Research source**: Production aggregator patterns (1inch, Jupiter, ParaSwap), progressive enhancement, "last known good" caching.

**What this means for ClearRoute**: Currently when all 7 live adapters fail, the UI silently shows "All live quote adapters failed before normalization" with no mock fallback and no retry UI. Users see a broken page.

### Error State Matrix

| Failure Mode | UX Behavior | Button State |
|-------------|-------------|-------------|
| All adapters fail | Show last cached quote with staleness warning + retry button | Disabled ("Unavailable") |
| Partial adapter failure (3/7 fail) | Show best from remaining 4 + "3 sources unavailable" note | Enabled (if route found) |
| Network offline | Show offline banner + cached shell | Disabled |
| API rate limited (429) | Show retry countdown + "Too many requests" | Disabled |
| Single adapter timeout | Hide that adapter's row, use others | Enabled (if alternative found) |
| Invalid API response | Hide that adapter, log to telemetry | Enabled (if alternative found) |

### Concrete Implementation

**Last Known Good (LKG) cache** -- stored in React Query cache, survives adapter failures:

```ts
// In useLiveQuotes:
const { data, isError } = useQuery({
  queryKey: ["liveQuotes", ...],
  queryFn: fetchAllAdapters,
  staleTime: 20_000,
  placeholderData: (previousData) => previousData, // Show last successful data
});

// If fetch fails but we have cached data:
if (isError && data) {
  // Show cached data with staleness warning
  showWarning("Showing last known prices from 30 seconds ago. Retrying...");
  // Swap button MUST be disabled on cached data
  isSwapEnabled = false;
}
```

**Degraded mode banner** (new component: `src/components/NetworkStatus.tsx`):

```tsx
type NetworkStatus = "healthy" | "degraded" | "offline" | "error";

function NetworkStatusBanner({ status, adapterStatuses }: Props) {
  if (status === "healthy") return null;
  
  return (
    <div className={`networkBanner ${status}`} role="alert">
      {status === "degraded" && (
        <span>Showing quotes from {adapterStatuses.filter(a => a.ok).length} of {adapterStatuses.length} sources. Some liquidity providers are unavailable.</span>
      )}
      {status === "offline" && (
        <span>You are offline. Check your internet connection.</span>
      )}
      {status === "error" && (
        <span>All quote sources are currently unavailable. Please try again.</span>
      )}
      <button onClick={retry}>Retry</button>
    </div>
  );
}
```

**Per-widget error boundaries** -- don't let one failing component crash the entire page:

```tsx
// Wrap individual panels in error boundaries:
<ErrorBoundary fallback={<PanelFallback title="Route Comparison" />}>
  <RoutesPanel routes={decision.candidateRoutes} />
</ErrorBoundary>

<ErrorBoundary fallback={<PanelFallback title="Decision Proof" />}>
  <DecisionProofPanel decision={decision} />
</ErrorBoundary>
```

**Progressive enhancement**: Start with mock data (instant), enhance with live data:

```
Page Load:
  t=0ms:   Render UI shell + mock quote (from mockAdapter, always available)
  t=50ms:  Start live adapter fetches (background, non-blocking)
  t=500ms: Live quotes arrive -> replace mock data seamlessly
  t=2000ms: Still loading -> show skeleton shimmer, keep mock data
  t=8000ms: All failed -> show degraded banner, fall back to mock data
```

**Timing**: Phase 2 (runtime safety -- pairs with error boundary and React Query patterns)

---

## Decision 18: UTXO selection awareness and wallet-side coin selection (NEW - Level 10)

**Research source**: CIP-0002 Coin Selection Algorithms, MeshJS/Lucid/CSL SDK patterns, Cardano min-ADA specification, collateral UTXO requirements for Plutus scripts.

**What this means for ClearRoute**: Currently the codebase delegates all UTXO selection to the wallet via CIP-30's `signTx`. This is architecturally correct — wallets perform their own final coin selection. However, the dApp has **zero awareness** of whether the wallet has sufficient UTXOs, adequate collateral, or healthy UTXO distribution (not fragmented into dust).

### The dApp's Responsibility Boundary

| Responsibility | dApp | Wallet |
|---------------|------|--------|
| Define transaction intent (inputs, outputs, scripts) | ✅ | ❌ |
| Coin selection (which UTXOs to spend) | ❌ | ✅ |
| Collateral selection | ❌ | ✅ (but dApp must ensure tx has collateral input) |
| Fee calculation | ✅ (estimate) | ✅ (final) |
| Min-ADA calculation for token outputs | ✅ (required for tx building) | ❌ |
| UTXO fragmentation detection & warning | ✅ (pre-flight check) | ❌ |

### What the dApp CAN and SHOULD do

**1. Pre-flight UTXO sufficiency check** (before building transaction):

```ts
// src/domain/utxoCheck.ts
import type { Cip30WalletApi } from "../wallet/cip30";
import { parseBalanceCbor } from "../wallet/cip30";

export type UtxoHealth = {
  hasEnoughInput: boolean;
  hasCollateralUtxo: boolean;
  adaOnlyUtxos: number;
  estimatedFeeCoverage: boolean;
  warnings: string[];
};

export async function checkUtxoHealth(
  walletApi: Cip30WalletApi,
  requiredAdaInput: bigint,
  estimatedFee: bigint
): Promise<UtxoHealth> {
  const cborHex = await walletApi.getBalance();
  const balance = parseBalanceCbor(cborHex);

  const totalAda = balance.assets["lovelace"] ?? 0n;
  const warnings: string[] = [];

  // Must have enough ADA for input + fees + margin
  const required = requiredAdaInput + estimatedFee + 2_000_000n; // 2 ADA margin
  if (totalAda < required) {
    warnings.push(
      `Insufficient balance. Have ${Number(totalAda) / 1e6} ADA, need ${Number(required) / 1e6} ADA including fees.`
    );
  }

  // Note: Cannot check individual UTXO fragmentation via CIP-30 alone.
  // Most CIP-30 wallets don't expose `getUtxos()`. This is a known limitation.
  // For fragmentation detection, we'd need Blockfrost's `/addresses/{addr}/utxos` endpoint.

  return {
    hasEnoughInput: totalAda >= required,
    hasCollateralUtxo: true, // Assume wallet handles this (CIP-30 signTx validates collateral)
    adaOnlyUtxos: -1, // Unknown without getUtxos()
    estimatedFeeCoverage: totalAda >= required,
    warnings,
  };
}
```

**2. Min-ADA calculation** (already needed for transaction building):

The current codebase uses Blockfrost API for transaction building (`minswapBuildTx.ts`). The min-ADA requirement for token outputs is calculated server-side by Blockfrost/Minswap. However, if moving to client-side transaction building in the future, the formula is:

```ts
// Cardano min-ADA calculation (if ever needed client-side)
// coinsPerUTxOWord = 34482 lovelace (current protocol parameter)
function computeMinAdaForOutput(tokens: { policyId: string; assetName: string; quantity: bigint }[]): bigint {
  const COINS_PER_UTXO_WORD = 34_482n; // From protocol parameters
  
  let sizeInBytes = 6; // Base UTXO overhead (no tokens) = lovelace only
  
  for (const token of tokens) {
    sizeInBytes += 12; // Policy ID takes 28 bytes raw -> ~12 words in CBOR
    sizeInBytes += token.assetName.length; // Asset name bytes
    sizeInBytes += 4; // Quantity encoding overhead
  }
  
  const words = BigInt(Math.ceil(sizeInBytes / 8)); // Round up to words (8-byte units)
  return words * COINS_PER_UTXO_WORD;
}
```

**3. Collateral awareness in swap UI**:

For DEX swap transactions that interact with Plutus scripts, the wallet must provide collateral (~5 ADA in a dedicated ADA-only UTXO). Most modern wallets handle this automatically. The dApp should:
- Add a pre-swap check: "Wallet requires a 5 ADA collateral UTXO for smart contract interaction"
- If the wallet rejects with a collateral error, show a helpful message: "Your wallet may not have a collateral UTXO. Go to your wallet settings to set up collateral."

```ts
// src/domain/utxoCheck.ts (continued)
const COLLATERAL_ERROR_PATTERNS = [
  "NoCollateralInput",
  "InsufficientCollateral",
  "collateral",
  "CollateralReturn",
];

export function isCollateralError(error: string): boolean {
  return COLLATERAL_ERROR_PATTERNS.some((pattern) =>
    error.toLowerCase().includes(pattern.toLowerCase())
  );
}

export const COLLATERAL_HELP_TEXT =
  "Your wallet needs a collateral UTXO (~5 ADA) for smart contract interactions. " +
  "Go to your wallet settings → Collateral to set it up.";
```

**Key architectural decision**: We do NOT need CSL/MeshJS/Lucid for UTXO selection because the wallet handles it. The dApp's job is pre-flight validation and helpful error messages, not coin selection itself.

**Timing**: Phase 6 (protocol & wallet fixes — pairs with CIP30 compliance)

---

## Decision 19: Session persistence and wallet reconnect (NEW - Level 10)

**Research source**: Production dApp patterns (Uniswap, Jupiter), `wagmi` reconnect patterns, CIP-30 `onAccountChange` events, tab visibility API.

**What this means for ClearRoute**: Currently the app has no session persistence. On browser refresh, wallet disconnects, token selections reset, and the user starts from scratch. Production dApps silently reconnect the wallet and restore user preferences.

### Three-Layer Persistence Strategy

| Layer | What's Persisted | Storage | TTL |
|-------|-----------------|---------|-----|
| Wallet identity | Last connected wallet key ("lace", "eternl", etc.) | localStorage | Indefinite (until explicit disconnect) |
| User preferences | Selected tokens, slippage tolerance, network choice | localStorage | Indefinite |
| Swap execution state | Pending transaction ID, submitted timestamp | localStorage | 1 hour (chain finality window) |

### Concrete Implementation

**Layer 1: Silent wallet reconnect on page load**

```ts
// src/hooks/useWalletReconnect.ts
const WALLET_KEY_STORAGE = "clearroute:wallet:lastConnected";

export function useWalletReconnect(
  cardano: unknown,
  onConnected: (api: Cip30WalletApi, wallet: WalletInfo) => void
) {
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    const lastWalletKey = localStorage.getItem(WALLET_KEY_STORAGE);
    if (!lastWalletKey || typeof cardano !== "object" || cardano === null) return;

    const record = cardano as Record<string, unknown>;
    const provider = record[lastWalletKey];
    if (!provider || typeof (provider as any).enable !== "function") return;

    setIsReconnecting(true);
    (provider as Cip30WalletProvider)
      .enable()
      .then((api) => {
        onConnected(api, { id: lastWalletKey, name: (provider as any).name ?? lastWalletKey });
      })
      .catch(() => {
        localStorage.removeItem(WALLET_KEY_STORAGE); // Stale key, clean up
      })
      .finally(() => setIsReconnecting(false));
  }, []);

  function persistWalletKey(key: string) {
    localStorage.setItem(WALLET_KEY_STORAGE, key);
  }

  function clearWalletKey() {
    localStorage.removeItem(WALLET_KEY_STORAGE);
  }

  return { isReconnecting, persistWalletKey, clearWalletKey };
}
```

**Layer 2: User preference persistence**

```ts
// src/hooks/usePreferences.ts
const PREFS_STORAGE = "clearroute:preferences";

type UserPreferences = {
  inputSymbol?: string;
  outputSymbol?: string;
  slippageTolerance?: number; // e.g., 0.5 meaning 0.5%
  selectedNetwork?: "mainnet" | "preprod" | "preview";
};

export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    try {
      return JSON.parse(localStorage.getItem(PREFS_STORAGE) ?? "{}");
    } catch {
      return {};
    }
  });

  function updatePrefs(patch: Partial<UserPreferences>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(PREFS_STORAGE, JSON.stringify(next));
      return next;
    });
  }

  return [prefs, updatePrefs] as const;
}
```

**Layer 3: Pending transaction persistence**

```ts
// src/hooks/useTxPersistence.ts
const TX_STORAGE_PREFIX = "clearroute:tx:";
const TX_TTL_MS = 60 * 60 * 1000; // 1 hour

type PersistedTx = {
  txHash: string;
  submittedAt: number;
  inputSymbol: string;
  outputSymbol: string;
  amountIn: number;
  networkName: string;
};

export function useTxPersistence() {
  function persistTx(txHash: string, metadata: Omit<PersistedTx, "txHash" | "submittedAt">) {
    const entry: PersistedTx = {
      txHash,
      submittedAt: Date.now(),
      ...metadata,
    };
    localStorage.setItem(`${TX_STORAGE_PREFIX}${txHash}`, JSON.stringify(entry));
  }

  function getPendingTransactions(): PersistedTx[] {
    const entries: PersistedTx[] = [];
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(TX_STORAGE_PREFIX)) continue;
      try {
        const entry: PersistedTx = JSON.parse(localStorage.getItem(key)!);
        if (now - entry.submittedAt < TX_TTL_MS) {
          entries.push(entry);
        } else {
          localStorage.removeItem(key); // Cleanup expired
        }
      } catch {
        localStorage.removeItem(key);
      }
    }
    return entries.sort((a, b) => b.submittedAt - a.submittedAt);
  }

  function clearTx(txHash: string) {
    localStorage.removeItem(`${TX_STORAGE_PREFIX}${txHash}`);
  }

  return { persistTx, getPendingTransactions, clearTx };
}
```

### Account Change Detection

CIP-30 wallets emit `onAccountChange` events. Production patterns call `window.location.reload()` to wipe all user-specific data:

```ts
// Add during wallet connection in src/wallet/cip30.ts or main.tsx
function setupAccountChangeListener(walletApi: Cip30WalletApi, walletKey: string) {
  const provider = (window as any).cardano?.[walletKey];
  if (typeof provider?.onAccountChange === "function") {
    provider.onAccountChange(() => {
      // Hard reload to clear all account-specific state
      // This prevents data leakage between accounts
      window.location.reload();
    });
  }
}
```

### Tab Visibility Refresh

When the user switches tabs and returns, quotes are stale. Auto-refresh:

```ts
// src/hooks/useTabVisibility.ts
export function useTabVisibility(onVisible: () => void) {
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        onVisible();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [onVisible]);
}

// Usage in App:
const { refetchQuotes } = useLiveQuotes(...);
useTabVisibility(() => {
  refetchQuotes(); // React Query auto-dedupes if already fresh
});
```

**What this eliminates**: User frustration on refresh, lost token selections, invisible pending transactions. Also partially addresses LEAK-1 (the cancelled boolean pattern becomes unnecessary with React Query).

**Timing**: Phase 2 (pairs with React Query migration for clean async management)

---

## Decision 20: Concurrency safety with AbortController + request ID matching (NEW - Level 10)

**Research source**: Production patterns from Uniswap and Jupiter swap interfaces, AbortController best practices, `exhaustMap` for deduplication.

**What this means for ClearRoute**: The current codebase uses a `cancelled` boolean flag pattern in `useEffect` (visible in `main.tsx` line 187+). This is fragile — it only works for the cleanup of a single effect, not for rapid input changes, duplicate clicks, or stale quote responses overwriting fresh ones.

### The Three-Part Concurrency Safety System

**Part 1: AbortController in the fetch layer**

Already partially implemented via `fetchWithTimeout` in `fetchUtils.ts` — but the timeout AbortController is scoped per-request, not passed by the caller. Refactor to accept an external signal:

```ts
// src/adapters/fetchUtils.ts — updated signature
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number; externalSignal?: AbortSignal } = {}
): Promise<Response> {
  const { timeoutMs = 8000, externalSignal, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  // Combine external signal with timeout signal
  if (externalSignal) {
    externalSignal.addEventListener("abort", () => controller.abort());
    if (externalSignal.aborted) controller.abort();
  }
  
  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Part 2: Request ID matching in React Query**

React Query v5+ handles this automatically when using `queryKey` changes. But for the transition period before React Query adoption, use a manual request ID pattern:

```ts
// src/hooks/useSafeAsync.ts — generic pattern until React Query migration
import { useRef, useCallback } from "react";

export function useSafeAsync<TArgs extends unknown[], TResult>(
  fn: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>
) {
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(async (...args: TArgs): Promise<TResult> => {
    // Cancel previous request
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    
    const requestId = ++requestRef.current;
    const signal = abortRef.current.signal;
    
    const result = await fn(signal, ...args);
    
    // Only return result if this is still the latest request
    if (requestId !== requestRef.current) {
      throw new DOMException("Stale request", "AbortError");
    }
    
    return result;
  }, [fn]);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return [execute, cleanup] as const;
}
```

**Part 3: Deduplication guard for swap execution**

Prevent double-submission with an `isExecuting` ref — NOT state (refs are synchronous):

```ts
// In useSwapExecution:
const isExecutingRef = useRef(false);

async function executeSwap() {
  // Guard: prevent double-click submission
  if (isExecutingRef.current) {
    telemetry.track("swap_double_click_blocked", { severity: "warn" });
    return;
  }
  isExecutingRef.current = true;
  
  try {
    // ... execute swap pipeline ...
  } finally {
    isExecutingRef.current = false;
  }
}

// Also: disable button when executing
// <button disabled={isExecuting || isQuoteStale}>Confirm and swap</button>
```

### Debounce Pattern for Quote Input

Production DEXs use 300-500ms debounce on amount input to prevent excessive API calls:

```ts
// src/hooks/useDebouncedValue.ts
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeoutId);
  }, [value, delayMs]);

  // But during timeout, if value is cleared (empty input), return immediately
  if (value === "" || value === undefined || value === 0) {
    return value;
  }

  return debounced;
}
```

### Race Condition Prevention Checklist

| Hazard | Prevention |
|--------|-----------|
| Stale quote overwrites fresh quote | Request ID matching (or React Query queryKey invalidation) |
| Double-click submits twice | `isExecutingRef` guard (synchronous, not state) |
| Rapid token switching | AbortController cancels previous fetch |
| Submit while quote refreshing | Button disabled when `isQuoteStale` |
| Component unmounts mid-fetch | AbortController cleanup in useEffect return |

**What this eliminates**: RACE-1 and RACE-2 from the audit. The core race condition where setExecutionState calls interleave during handleExecuteSwap.

**Timing**: Phase 2 (pairs with useReducer + React Query migrations)

---

## Decision 21: Mobile-responsive swap interface (NEW - Level 10)

**Research source**: Uniswap, Jupiter, 1inch mobile UX patterns; WCAG touch target standards; bottom sheet vs modal patterns; responsive data tables.

**What this means for ClearRoute**: The current interface uses a single `styles.css` file with desktop-first layout. No media queries. On mobile, the multi-column route comparison table, wallet panel, and swap card will be cramped or broken.

### Mobile-First Design System

**Design tokens via CSS custom properties** (update `src/styles.css`):

```css
:root {
  /* Spacing scale */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Touch targets: minimum 44x44 for interactive elements */
  --touch-target-min: 44px;

  /* Breakpoints */
  --bp-sm: 480px;
  --bp-md: 768px;
  --bp-lg: 1024px;

  /* Container widths */
  --container-sm: 100%;
  --container-md: 480px;
  --container-lg: 640px;

  /* Colors — inherited from current design */
  --color-bg: #0a0a0f;
  --color-surface: #14141f;
  --color-border: #2a2a3a;
  --color-text: #e0e0f0;
  --color-text-muted: #8888aa;
  --color-primary: #7c3aed;
  --color-primary-glow: rgba(124, 58, 237, 0.3);
  --color-success: #22c55e;
  --color-error: #ef4444;
  --color-warning: #f59e0b;
}
```

### Component Layout Strategy

**Desktop (>=768px)**: Side-by-side panels — swap card (left) + route comparison + wallet (right).
**Mobile (<768px)**: Single column stack — swap card (full width) → route comparison (collapsed, expandable accordion) → wallet (collapsed).

```css
/* src/styles.css — mobile-first approach */

/* Base: mobile (single column) */
.app {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
  max-width: var(--container-sm);
  margin: 0 auto;
}

.swap-card {
  width: 100%;
  padding: var(--space-md);
}

/* Swap card inputs on mobile */
.swap-input-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* Token selector: full-width touch target */
.token-selector {
  width: 100%;
  min-height: var(--touch-target-min);
  padding: var(--space-sm) var(--space-md);
}

/* Swap button: full-width, tall for thumb */
.swap-button {
  width: 100%;
  min-height: 52px; /* Taller than 44px for primary action */
  font-size: 1.1rem;
  font-weight: 600;
}

/* Route comparison table → card stack on mobile */
.route-table {
  display: none; /* Hide traditional table on mobile */
}

.route-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.route-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-md);
  border-radius: 12px;
}

.route-card-row {
  display: flex;
  justify-content: space-between;
}

.route-card-label {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Bottom sheet for route details on mobile */
.bottom-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
  display: flex;
  align-items: flex-end;
}

.bottom-sheet {
  width: 100%;
  max-height: 85vh;
  background: var(--color-surface);
  border-radius: 20px 20px 0 0;
  padding: var(--space-lg);
  overflow-y: auto;
  animation: slideUp 0.25s ease-out;
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.bottom-sheet-handle {
  width: 36px;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  margin: 0 auto var(--space-md);
}

/* Desktop: side-by-side layout */
@media (min-width: 768px) {
  .app {
    flex-direction: row;
    flex-wrap: wrap;
    max-width: var(--container-lg);
    align-items: flex-start;
  }

  .swap-card {
    width: 400px;
    flex-shrink: 0;
  }

  .route-table {
    display: table; /* Show traditional table on desktop */
  }

  .route-cards {
    display: none; /* Hide card stack on desktop */
  }

  .swap-input-row {
    flex-direction: row;
  }

  .swap-button {
    width: auto;
  }
}

@media (min-width: 1024px) {
  .app {
    max-width: 1100px;
    gap: var(--space-xl);
  }
}
```

### Mobile Wallet Connection Flow

On mobile, browser extensions don't exist. Wallet connection requires a different flow:

```ts
// src/wallet/mobileWallet.ts
export function isMobileBrowser(): boolean {
  return /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
}

// If mobile and no CIP-30 extensions detected:
// 1. Show "Connect with WalletConnect" option
// 2. Open deep link to user's wallet app
// 3. Wallet app redirects back with connection
//
// For MVP: show message that mobile support requires a CIP-30 compatible wallet
// with built-in browser (e.g., Eternl, Vespr, Lace mobile)
```

**For the current scope** (browser extensions only), add a mobile detection banner:

```tsx
// In App component
{isMobileBrowser() && (
  <div className="mobile-notice" role="alert">
    <Info size={16} />
    For the best experience, use a desktop browser with a CIP-30 wallet extension 
    (Lace, Eternl, Yoroi, etc.). Mobile wallet support coming soon.
  </div>
)}
```

### Touch Target Audit

Current interactive elements to verify against the 44×44 minimum:
- Token selector buttons (🔴 ADA, 🔴 SNEK, etc.)
- Swap direction toggle (ArrowDownUp icon)
- Amount input fields
- "Check wallet" button
- "Confirm and swap" button
- Wallet connect buttons in dropdown

All should have `min-height: 44px` and `min-width: 44px` on mobile via CSS.

**What this eliminates**: A11Y-5 (small touch targets on mobile), plus prevents mobile users from seeing a broken layout.

**Timing**: Phase 7 (polish — alongside A11Y fixes). The CSS variables and mobile-first refactor can be done incrementally.

---

## Decision 22: Fee optimization and transaction cost transparency (NEW - Level 11)

**Research source**: Cardano fee formula (`a × size(tx) + b`), MeshJS/Lucid `complete()` patterns, reference inputs for size reduction, script execution unit pricing, batcher fee models.

**What this means for ClearRoute**: The current codebase delegates all transaction building to the Minswap Aggregator API (`minswapBuildTx.ts`). Fees are handled server-side with zero visibility to the dApp UI. Users see no fee estimate before signing. Additionally, there's no fee comparison across protocols — Minswap, SundaeSwap, and batcher-based routes may have materially different fee structures.

### Cardano Fee Formula

```
Total Fee = (a × tx_size_bytes) + b + script_fee

a ≈ 44 lovelace/byte (protocol parameter: txFeePerByte)
b ≈ 155,381 lovelace (protocol parameter: txFeeFixed)

Script Fee = (mem_price × mem_units) + (step_price × cpu_steps)
  mem_price ≈ 0.0577 lovelace/memory_unit
  step_price ≈ 0.0000721 lovelace/cpu_step
```

### What the dApp Should Show

**Fee estimator utility** (new file: `src/domain/feeEstimation.ts`):

```ts
import type { QuoteAdapterResult } from "../adapters/types";

// Protocol parameters — fetched from Blockfrost /genesis or hardcoded with periodic refresh
const TX_FEE_PER_BYTE = 44n;       // lovelace/byte
const TX_FEE_FIXED = 155_381n;     // lovelace

export type FeeEstimate = {
  estimatedAda: number;        // Human-readable ADA
  estimatedLovelace: bigint;   // Exact lovelace
  breakdown: {
    baseFee: bigint;           // a × size + b
    scriptFee: bigint;         // Estimated script execution cost
    batcherFee: bigint;        // If using a batcher service
  };
  source: "server" | "estimated" | "unknown";
};

/**
 * Estimate fee for a DEX swap.
 * Since ClearRoute uses the Minswap Aggregator API for transaction building,
 * the exact fee is determined server-side. This provides a UI estimate.
 */
export function estimateSwapFee(result: QuoteAdapterResult): FeeEstimate {
  // For server-built transactions, we can't calculate exact fees client-side.
  // Show a conservative estimate based on typical Cardano swap tx sizes.
  
  // Typical swap transaction:
  // - 1-2 input UTXOs: ~300 bytes
  // - 1-2 output UTXOs: ~200 bytes
  // - 1 script reference input: ~50 bytes
  // - Redeemer + datum: ~200 bytes
  // - Witnesses: ~200 bytes
  // Total: ~950 bytes
  const ESTIMATED_SWAP_TX_SIZE = 950n;
  
  const baseFee = TX_FEE_PER_BYTE * ESTIMATED_SWAP_TX_SIZE + TX_FEE_FIXED;
  
  // Script execution: typical DEX swap uses ~300M mem + ~600M cpu
  const MEM_PRICE = 577n;       // Scaled: 0.0577 × 10000
  const STEP_PRICE = 721n;      // Scaled: 0.0000721 × 10000000
  const EST_MEM_UNITS = 300_000_000n;
  const EST_CPU_STEPS = 600_000_000n;
  
  const scriptFee = (MEM_PRICE * EST_MEM_UNITS + STEP_PRICE * EST_CPU_STEPS) / 10_000_000n;
  
  const totalLovelace = baseFee + scriptFee + 2_000_000n; // +2 ADA safety margin
  
  return {
    estimatedAda: Number(totalLovelace) / 1e6,
    estimatedLovelace: totalLovelace,
    breakdown: {
      baseFee,
      scriptFee,
      batcherFee: 0n, // Minswap Aggregator may charge a batcher fee — TBD
    },
    source: "estimated",
  };
}

/**
 * Format fee for UI display.
 * Example: "~0.18 ADA (estimated)"
 */
export function formatFeeEstimate(estimate: FeeEstimate): string {
  const prefix = estimate.source === "estimated" ? "~" : "";
  const suffix = estimate.source === "estimated" ? " (estimated)" : "";
  return `${prefix}${estimate.estimatedAda.toFixed(2)} ADA${suffix}`;
}

/**
 * Compare fees across protocol routes.
 * Different aggregators (Minswap batcher, SundaeSwap direct) have different fee models.
 */
export function compareRouteFees(results: QuoteAdapterResult[]): Map<string, FeeEstimate> {
  const estimates = new Map<string, FeeEstimate>();
  for (const result of results) {
    if (result.ok) {
      estimates.set(result.adapterId, estimateSwapFee(result));
    }
  }
  return estimates;
}
```

### Fee Display in Swap UI

Add a fee breakdown line in the swap confirmation panel:

```tsx
// In the swap confirmation section of the UI:
<div className="fee-breakdown">
  <div className="fee-row">
    <span>Estimated network fee</span>
    <span>{formatFeeEstimate(feeEstimate)}</span>
  </div>
  <div className="fee-row muted">
    <span>You receive (min)</span>
    <span>{formatMinOutput(quote)}</span>
  </div>
</div>
```

### Cost Transparency Across Protocols

Different DEX routes have different fee layers:

| Fee Layer | Minswap Aggregator API | SundaeSwap V3 Direct | DexHunter |
|-----------|----------------------|----------------------|-----------|
| Network fee (a×size+b) | ✅ Server-side | ✅ Client-side | ✅ Server-side |
| Script execution | ✅ Included | ✅ Client-estimated | ✅ Included |
| LP fee (0.3% typical) | Embedded in price | Embedded in price | Embedded in price |
| Batcher service fee | May apply | N/A (direct pool) | May apply |
| Aggregator fee | May apply | N/A | May apply |

**Key insight**: "Best price" does not always mean "best net output." The route comparison must account for fee differences. A route with 460 SNEK output but 0.5 ADA batcher fee may be worse than a route with 455 SNEK output and 0.18 ADA network fee only.

**Timing**: Phase 1 (data integrity — fee-aware net output comparisons). The estimator can start as a conservative heuristic and be refined as protocol parameters are fetched dynamically.

---

## Decision 23: Slippage protection and minimum-output guarantees (NEW - Level 11)

**Research source**: Production DEX patterns from 1inch, Jupiter (RTSE), Uniswap. Slippage tolerance UX: auto-mode with manual override. Multi-hop cumulative slippage model.

**What this means for ClearRoute**: The current codebase has `slippageTolerancePct` in `QuoteRequest` and passes it to the Minswap Aggregator API. However, there is zero user-facing slippage UX — no tolerance selector, no `minAmountOut` display, no price impact warning, and no explanation of what slippage means. This is a critical DeFi UX gap: users must understand their downside protection before signing.

### The Slippage UX Formula

```
minAmountOut = expectedAmountOut × (1 - slippageTolerance / 100)
```

If expected output is 460 SNEK and slippage is 0.5%:
`minAmountOut = 460 × (1 - 0.005) = 457.7 SNEK`

If the actual output is below 457.7 SNEK, the transaction reverts. The user's funds are safe.

### Concrete Implementation

**Slippage calculator** (new file: `src/domain/slippage.ts`):

```ts
import type { AssetId } from "./assets";

export type SlippageConfig = {
  tolerancePct: number;      // e.g., 0.5 = 0.5%
  auto: boolean;              // Was this auto-selected?
  estimatedPriceImpact: number; // Current price impact %
};

export const SLIPPAGE_PRESETS = [
  { label: "0.1%", value: 0.1, description: "Best price, higher revert risk" },
  { label: "0.5%", value: 0.5, description: "Recommended for most swaps" },
  { label: "1.0%", value: 1.0, description: "Safer, lower revert risk" },
  { label: "3.0%", value: 3.0, description: "High volatility protection" },
] as const;

export const DEFAULT_SLIPPAGE_PCT = 0.5;

/**
 * Calculate minimum output with slippage protection.
 * Uses BigInt-compatible math to avoid floating-point rounding.
 */
export function computeMinAmountOut(
  expectedAmountOut: number,
  slippageTolerancePct: number,
): number {
  // (1 - slippage/100) × expected
  const slippageFactor = 1 - slippageTolerancePct / 100;
  return expectedAmountOut * slippageFactor;
}

/**
 * Estimate price impact from pool reserves.
 * Price impact = amountIn / (reserveIn + amountIn)
 * Higher impact = worse price. Warn at >1%, block/confirm at >5%.
 */
export function estimatePriceImpact(
  amountIn: number,
  reserveIn: number,
): number {
  if (reserveIn <= 0) return Infinity;
  return (amountIn / (reserveIn + amountIn)) * 100;
}

export const PRICE_IMPACT_WARNING_THRESHOLD = 1.0;  // Show warning
// Note: actual "block" threshold is at the wallet level (user must acknowledge)

export function getPriceImpactSeverity(impact: number): "none" | "low" | "warning" | "high" {
  if (impact < 0.5) return "none";
  if (impact < 1.0) return "low";
  if (impact < 5.0) return "warning";
  return "high";
}

/**
 * Recommend auto-slippage based on asset volatility heuristics.
 * More volatile pairs need wider slippage to avoid reverts.
 * 
 * Heuristic (can be refined with real volatility data):
 * - ADA ↔ Stablecoins: 0.1% (low volatility)
 * - ADA ↔ Major tokens (SNEK, MIN): 0.5% (medium)
 * - ADA ↔ Low-liquidity tokens: 1.0%+ (high)
 * - Token ↔ Token (non-ADA): 1.0%+
 */
export function recommendSlippage(
  inputAssetId: AssetId,
  outputAssetId: AssetId,
  estimatedPriceImpact: number,
): number {
  // If price impact is already high, suggest wider slippage
  if (estimatedPriceImpact > 3.0) return 1.0;
  if (estimatedPriceImpact > 1.0) return 0.5;
  
  const isAdaPair = inputAssetId === "lovelace" || outputAssetId === "lovelace";
  if (!isAdaPair) return 1.0; // Token-to-token needs more buffer
  
  return 0.5; // Default for ADA pairs
}
```

**Slippage settings UI component** (new file: `src/components/SlippageSettings.tsx`):

```tsx
interface SlippageSettingsProps {
  slippage: SlippageConfig;
  onSlippageChange: (tolerancePct: number, auto: boolean) => void;
  disabled?: boolean;
}

export function SlippageSettings({ slippage, onSlippageChange, disabled }: SlippageSettingsProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");

  function handlePreset(value: number) {
    setShowCustom(false);
    onSlippageChange(value, true);
  }

  function handleCustomSubmit() {
    const parsed = parseFloat(customValue);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
      onSlippageChange(parsed, false);
      setShowCustom(false);
    }
  }

  return (
    <div className="slippage-settings" role="group" aria-label="Slippage tolerance">
      <div className="slippage-header">
        <span className="slippage-label">Max slippage</span>
        <Info size={14} className="help-icon" title="Your transaction will revert if the price moves unfavorably by more than this percentage." />
      </div>
      <div className="slippage-presets">
        {SLIPPAGE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            className={`slippage-preset ${slippage.tolerancePct === preset.value && slippage.auto ? "active" : ""}`}
            onClick={() => handlePreset(preset.value)}
            disabled={disabled}
            title={preset.description}
          >
            {preset.label}
          </button>
        ))}
        <button
          className={`slippage-preset ${!slippage.auto ? "active" : ""}`}
          onClick={() => setShowCustom(!showCustom)}
          disabled={disabled}
        >
          Custom
        </button>
      </div>
      {showCustom && (
        <div className="slippage-custom">
          <input
            type="number"
            min="0.01"
            max="50"
            step="0.01"
            placeholder="0.50"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
            aria-label="Custom slippage percentage"
          />
          <span>%</span>
        </div>
      )}
      {slippage.estimatedPriceImpact > PRICE_IMPACT_WARNING_THRESHOLD && (
        <div className="price-impact-warning" role="alert">
          <Zap size={14} />
          Price impact: {slippage.estimatedPriceImpact.toFixed(1)}%
        </div>
      )}
    </div>
  );
}
```

### Multi-hop Slippage Model

For routes that span multiple pools (e.g., ADA → MIN → SNEK), the slippage check applies to the final cumulative output:

```ts
// Cumulative slippage for multi-hop:
// Route: ADA → Pool A (MIN) → Pool B (SNEK)
// minAmountOut is set on the FINAL output token (SNEK)
// If any hop fails, the entire transaction atomically reverts
// No need for per-hop slippage checks
```

This is architecturally correct for the current codebase since the Minswap Aggregator API builds the full transaction and sets the `minReceive` field in the datum. The dApp's job is to show the user what `minReceive` means.

**Timing**: Phase 4 (UX improvements — alongside error recovery patterns). The slippage controls are a critical trust signal for any DeFi interface.

---

## Decision 24: Datum construction awareness and batcher-model understanding (NEW - Level 11)

**Research source**: Minswap V2 and SundaeSwap V3 Aiken contract specifications, eUTxO batcher model, Lucid `Data.Object` patterns, inline datum requirements.

**What this means for ClearRoute**: The current codebase builds swap transactions exclusively through the Minswap Aggregator API (`minswapBuildTx.ts`). The API constructs the datum server-side. This is architecturally fine for an aggregator, but the codebase also has `minswapV2DirectPoolAdapter` and `sundaeSwapV3DirectPoolAdapter` — which bypass the aggregator API and work with pool states directly. Understanding the datum construction model is essential for correctly implementing these direct-pool paths.

### The Cardano DEX Batcher Model

Unlike Ethereum DEXs where users interact directly with pool contracts, Cardano DEXs use a **batcher model**:

```
User creates Order UTxO → Batcher picks it up → Batcher executes swap on LP pool → User receives output

Flow:
  1. User builds tx with Order Datum (sender, receiver, minReceive, token_in, token_out)
  2. User signs and submits Order UTxO to the Order Validator script address
  3. Batcher service monitors for new Order UTxOs
  4. Batcher builds a tx that:
     - Consumes the Order UTxO
     - Consumes LP pool UTxOs
     - Produces output UTxO for the user
     - Produces updated LP pool UTxO
  5. Batcher submits the execution tx
```

### Minswap V2 Datum Structure

```ts
// Conceptual Minswap V2 Order Datum (from Aiken contract)
// This is NOT client-side code — it represents what the aggregator API constructs

type MinswapV2OrderDatum = {
  sender: string;           // PubKeyHash — who can cancel
  receiver: string;         // Address — where to send proceeds
  receiver_datum_hash: string | null; // Optional datum hash for receiver
  step: {
    type: "SwapExactIn" | "SwapExactOut" | "Deposit" | "Withdraw";
    // For SwapExactIn:
    desired_asset: { policyId: string; assetName: string }; // What to receive
    minimum_receive: bigint; // Min amount out (slippage protection)
  };
  batcher_fee: {
    output: { address: string; amount: bigint }; // Fee paid to batcher
  };
};
```

### SundaeSwap V3 Datum Structure

```ts
// Conceptual SundaeSwap V3 Order Datum
// V3 uses a more flexible "strategy" pattern

type SundaeSwapV3OrderDatum = {
  sender: string;
  receiver: string;
  // V3 separates order specification from execution strategy
  order: {
    offered: { policyId: string; assetName: string; amount: bigint };
    asked: { policyId: string; assetName: string; amount: bigint }; // Min receive
  };
  scooper_fee: bigint; // Fee paid to scooper (batcher equivalent)
};
```

### What this means for the codebase

**Current state**: Both `minswapV2DirectPoolAdapter.ts` and `sundaeSwapV3DirectPoolAdapter.ts` fetch pool states but do NOT build transactions. They compute hypothetical outputs from pool reserves. Transaction building is entirely delegated to `minswapBuildTx.ts` which calls the aggregator API.

**Architectural implication**:

1. **Direct-pool adapters are read-only** — they provide price discovery but not execution. This is correct for an aggregator.
2. **Transaction building stays server-side** — the aggregator API constructs the datum with correct CBOR encoding, script hashes, and redeemer structure.
3. **If direct-pool execution is ever needed**, the dApp would need:
   - A CSL or Lucid dependency for CBOR encoding
   - Correct script hashes for each DEX's Order Validator
   - Correct redeemer indices (e.g., `Constr(0, [])` for Swap)
   - Inline datum construction matching Aiken types exactly

**For the current architecture, NO changes are needed.** The direct-pool adapters correctly compute theoretical outputs from pool math, and the aggregator API correctly builds executable transactions.

However, documentation should note:

```ts
// In minswapV2DirectPoolAdapter.ts and sundaeSwapV3DirectPoolAdapter.ts:
/**
 * READ-ONLY ADAPTER: This adapter computes theoretical swap outputs from
 * on-chain pool reserves using constant-product AMM math. It does NOT build
 * executable transactions. Transaction building is delegated to the Minswap
 * Aggregator API (minswapBuildTx.ts) or DexHunter API which handle:
 * - Correct datum CBOR encoding
 * - Batcher fee calculation
 * - Script hash resolution
 * - Redeemer construction
 */
```

**Timing**: Phase 6 (documentation alongside protocol correctness). No code changes required — this decision formalizes the existing architectural boundary.

---

## Decision 25: Token metadata management and dynamic token lists (NEW - Level 11)

**Research source**: Uniswap Token List standard, CIP-26 off-chain metadata, Cardano Foundation token registry, virtual scrolling patterns for 1000+ token selectors.

**What this means for ClearRoute**: Currently the codebase hardcodes 4 tokens (`ADA`, `SNEK`, `MIN`, `HOSKY`) in `selectableSymbols` and uses a static `ASSETS` dictionary in `src/domain/assets.ts`. This works for an MVP with 4 tokens, but the long-term vision of a DEX aggregator requires dynamic token discovery, metadata fetching, and scalable token selection UX.

### Current State vs Target

| Aspect | Current (MVP) | Target (v1+) |
|--------|--------------|-------------|
| Token list | Hardcoded 4 tokens | Dynamic, fetched from token registry |
| Metadata | Static `ASSETS` dict | Fetched from Blockfrost/CIP-26 |
| Logo images | None | CDN-cached, lazy-loaded |
| Token search | Symbol dropdown | Fuzzy search with virtual scroll |
| Decimals | Static in ASSETS | Fetched with metadata |

### Concrete Implementation (for future phase)

**Token registry service** (new file: `src/services/tokenRegistry.ts`):

```ts
import type { AssetId } from "../domain/assets";

export type TokenMetadata = {
  assetId: AssetId;
  policyId: string;
  assetName: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
  verified: boolean; // From trusted registry?
};

export type TokenList = {
  name: string;
  version: string;
  updatedAt: string;
  tokens: TokenMetadata[];
};

/**
 * Fetch token metadata from Blockfrost or a Cardano token registry.
 * Uses CIP-26 off-chain metadata standard.
 */
export async function fetchTokenMetadata(
  assetIds: AssetId[],
  blockfrostBaseUrl: string,
  blockfrostProjectId: string,
): Promise<Map<AssetId, TokenMetadata>> {
  const metadata = new Map<AssetId, TokenMetadata>();

  // Blockfrost endpoint: GET /assets/{assetId}
  // Returns on-chain metadata (name, decimals) and off-chain metadata (logo, ticker)
  
  const results = await Promise.allSettled(
    assetIds.map(async (assetId) => {
      // Blockfrost asset endpoint:
      // /assets/{assetId} returns { asset, policy_id, asset_name, metadata, ... }
      const res = await fetch(
        `${blockfrostBaseUrl}/assets/${assetId}`,
        { headers: { project_id: blockfrostProjectId } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      
      return {
        assetId,
        policyId: data.policy_id,
        assetName: data.asset_name ?? "",
        symbol: data.metadata?.ticker ?? data.metadata?.symbol ?? assetId.slice(0, 8),
        name: data.metadata?.name ?? assetId.slice(0, 16),
        decimals: data.metadata?.decimals ?? 0,
        logoUri: data.metadata?.logo ?? undefined,
        verified: false, // Blockfrost doesn't verify — need registry for this
      } satisfies TokenMetadata;
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      metadata.set(result.value.assetId, result.value);
    }
  }

  return metadata;
}
```

**Token list caching with React Query** (new file: `src/hooks/useTokenList.ts`):

```ts
import { useQuery } from "@tanstack/react-query";

export function useTokenList() {
  return useQuery({
    queryKey: ["tokenList"],
    queryFn: async () => {
      // In production: fetch from a hosted token list JSON
      // For MVP: return the static ASSETS dict wrapped as TokenMetadata
      const res = await fetch("/token-list.json");
      return res.json() as Promise<TokenList>;
    },
    staleTime: 60 * 60 * 1000, // Refresh token list every hour
    gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours
  });
}
```

**Virtualized token selector** (new file: `src/components/TokenSelector.tsx`):

```tsx
import { FixedSizeList } from "react-window";
import Fuse from "fuse.js";

interface TokenSelectorProps {
  tokens: TokenMetadata[];
  selected: AssetId | null;
  onSelect: (token: TokenMetadata) => void;
  onClose: () => void;
}

export function TokenSelector({ tokens, selected, onSelect, onClose }: TokenSelectorProps) {
  const [query, setQuery] = useState("");
  
  const fuse = useMemo(() => new Fuse(tokens, {
    keys: ["symbol", "name", "assetId"],
    threshold: 0.3,
    ignoreLocation: true,
  }), [tokens]);

  const filtered = query.trim()
    ? fuse.search(query).map(r => r.item)
    : tokens;

  return (
    <div className="token-selector-overlay" onClick={onClose}>
      <div className="token-selector-modal" onClick={e => e.stopPropagation()}>
        <input
          type="text"
          placeholder="Search tokens..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          aria-label="Search tokens"
        />
        <FixedSizeList
          height={400}
          itemCount={filtered.length}
          itemSize={56}
          width="100%"
        >
          {({ index, style }) => {
            const token = filtered[index];
            return (
              <button
                key={token.assetId}
                style={style}
                className={`token-option ${token.assetId === selected ? "selected" : ""}`}
                onClick={() => { onSelect(token); onClose(); }}
              >
                {token.logoUri && (
                  <img src={token.logoUri} alt="" width={32} height={32} loading="lazy" />
                )}
                <div className="token-info">
                  <span className="token-symbol">{token.symbol}</span>
                  <span className="token-name">{token.name}</span>
                </div>
                {token.verified && <ShieldCheck size={14} className="verified-badge" />}
              </button>
            );
          }}
        </FixedSizeList>
      </div>
    </div>
  );
}
```

### Migration Path

**Phase 1 (now)**: Keep the 4-token hardcoded list. No change.
**Phase 2 (post-React Query)**: Add `useTokenList` hook with static token list JSON.
**Phase 3 (post-proxy)**: Add `fetchTokenMetadata` using the serverless proxy for Blockfrost calls.
**Phase 4 (v1+)**: Add `TokenSelector` with virtual scrolling, fuzzy search, and logo caching.

**Dependencies**: React Query (Decision 2), API proxy (Decision 16), react-window, fuse.js.

**Timing**: Phase 7+ (post-MVP polish). This is a v1 enhancement, not blocking the initial implementation.

---

## Decision Summary: All 25 Decisions

| # | Decision | Category | Phase |
|---|----------|----------|-------|
| 1 | useReducer pipeline state machine | Architecture | 2 |
| 2 | React Query for live quotes | Data | 2 |
| 3 | cborg CBOR parser | Security | 0 |
| 4 | fast-check property testing | Testing | 3 |
| 5 | No CSL/MeshJS (REST API only) | Architecture | - |
| 6 | Error recovery UX | UX | 4 |
| 7 | BaseDexAdapter (Template Method) | Architecture | 5 |
| 8 | Dynamic adapter loading | Performance | 5 |
| 9 | E2E with mock CIP-30 wallet | Testing | 3 |
| 10 | Observability & telemetry | Operations | 5 |
| 11 | PWA (app shell + offline) | UX | 7 |
| 12 | Multi-network architecture | Architecture | 6 |
| 13 | Performance budgets | Operations | 5 |
| 14 | Web Worker offloading | Performance | 5 |
| 15 | Accessibility (ARIA + axe-core) | UX | 7 |
| 16 | API key security via proxy | Security | 5 |
| 17 | Graceful degradation | Resilience | 2 |
| 18 | UTXO selection awareness | Protocol | 6 |
| 19 | Session persistence & reconnect | UX | 2 |
| 20 | Concurrency safety | Reliability | 2 |
| 21 | Mobile-responsive design | UX | 7 |
| **22** | **Fee optimization & transparency** | **Protocol** | **1** |
| **23** | **Slippage protection UX** | **UX** | **4** |
| **24** | **Datum construction awareness** | **Architecture** | **6** |
| **25** | **Token metadata management** | **Data** | **7+** |

---

## Updated File Creation Map

| New File | Decision | Purpose |
|----------|----------|---------|
| `src/domain/executionMachine.ts` | 1 | useReducer state machine |
| `src/hooks/useSwapExecution.ts` | 1 | Swap execution hook |
| `src/hooks/useLiveQuotes.ts` | 2 | React Query wrapper |
| `src/hooks/useWalletDiscovery.ts` | - | Wallet detection hook |
| `src/hooks/useRouteDecision.ts` | 4 | Memoized route ranking |
| `src/hooks/useTxPersistence.ts` | 6 | localStorage tx tracking |
| `src/adapters/baseAdapter.ts` | 7 | Template Method base class |
| `src/telemetry/logger.ts` | 10 | Structured event logger |
| `src/workers/routeWorker.ts` | 14 | Web Worker for route ranking |
| `src/components/ErrorBoundary.tsx` | 2 | React error boundary |
| `src/components/Announcer.tsx` | 15 | ARIA live region announcer |
| `src/components/NetworkStatus.tsx` | 17 | Degraded mode banner |
| `src/config/networkConfig.ts` | 12 | Multi-network config |
| `public/sw.js` | 11 | Service worker |
| `public/manifest.json` | 11 | PWA manifest |
| `test/arbitraries.ts` | 4 | Shared fast-check generators |
| `src/domain/amm.property.test.ts` | 4 | AMM invariant tests |
| `src/domain/quoteEngine.property.test.ts` | 4 | Quote engine property tests |
| `src/main.integration.test.ts` | - | Integration safety net |
| `e2e/swap-flow.test.ts` | 9 | Mock wallet E2E tests |
| `stryker.config.json` | 4 | Mutation testing config |
| `lighthouserc.js` | 13 | Performance budget |
| `eslint.config.js` | - | Linting config |
| `api/proxy.ts` | 16 | Serverless API proxy |
| `vite.config.ts` (updated) | 13,16 | Proxy + budget + chunks |

### Files added in Decisions 18-21

| New File | Decision | Purpose |
|----------|----------|---------|
| `src/domain/utxoCheck.ts` | 18 | Pre-flight UTXO sufficiency + collateral detection |
| `src/hooks/useWalletReconnect.ts` | 19 | Silent wallet reconnect on page load |
| `src/hooks/usePreferences.ts` | 19 | User preference persistence (tokens, slippage) |
| `src/hooks/useTxPersistence.ts` | 19 | Pending transaction tracking via localStorage |
| `src/hooks/useTabVisibility.ts` | 19 | Auto-refresh quotes when tab becomes visible |
| `src/hooks/useSafeAsync.ts` | 20 | AbortController + request ID matching utility |
| `src/hooks/useDebouncedValue.ts` | 20 | 400ms debounce for quote input |
| `src/wallet/mobileWallet.ts` | 21 | Mobile detection + deep link helpers |

### Files added in Decisions 22-25

| New File | Decision | Purpose |
|----------|----------|---------|
| `src/domain/feeEstimation.ts` | 22 | Fee estimator + comparison across protocols |
| `src/domain/slippage.ts` | 23 | Slippage calculator + price impact + auto-slippage |
| `src/components/SlippageSettings.tsx` | 23 | Slippage tolerance selector UI |
| `src/services/tokenRegistry.ts` | 25 | Blockfrost/CIP-26 metadata fetcher |
| `src/hooks/useTokenList.ts` | 25 | React Query token list caching |
| `src/components/TokenSelector.tsx` | 25 | Virtualized fuzzy-search token picker |

**Total: 40 new files** planned across all 25 decisions.
