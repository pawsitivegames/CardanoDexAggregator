# Security Review

Review date: 2026-06-12
Scope: Pre-mainnet security audit of ClearRoute — codebase, env handling, auth, client-side risks.

## Summary

**2 issues found (both LOW).** No code execution, data exfiltration, or mainnet fund loss vectors identified. The app's security model is inherently low-risk because:

- Mainnet execution is locked (no mainnet transactions can be built or submitted)
- No private keys or seed phrases are ever handled
- API keys are optional (live adapters degrade gracefully without them)
- All external calls are read-only (Fixes) or require explicit user wallet interaction (signing)

---

## S-1: API keys embedded in build output

**Severity: LOW**

**Location**: `src/config/networks.ts:16-19`

```ts
export const CARDEXSCAN_API_KEY: string = import.meta.env.VITE_CARDEXSCAN_API_KEY ?? "";
export const SATURN_API_KEY: string = import.meta.env.VITE_SATURN_API_KEY ?? "";
```

Vite inlines `import.meta.env.VITE_*` variables at build time. API keys set in `.env` at build time are baked into the client-side JS bundle and visible in browser dev tools.

**Risk**: A user who has paid for a Cardexscan or SaturnSwap API key and sets it in `.env` before `npm run build` would embed that key in `dist/assets/*.js`. Anyone inspecting the bundle can extract it.

**Mitigating factors**:
- Keys are optional — all adapters return `failed_source` gracefully when no key is set
- These are API keys for read-only quote endpoints, not funds or write access
- Same pattern used throughout (Blockfrost, DexHunter partner ID — all `VITE_*` vars)

**Recommendation**: Document this limitation prominently in the deploy guide. Best practice for production: route live adapter calls through a proxy server that injects the key server-side. For now, acceptable for a prototype.

---

## S-2: No Content Security Policy (CSP) headers

**Severity: LOW**

**Location**: `index.html` and Vite config

No CSP meta tag or HTTP header is set. The app fetches from multiple external APIs (Minswap Agg, DexHunter, Steelswap, Cardexscan, SaturnSwap, Blockfrost).

**Risk**: XSS or data injection via compromised third-party API. If an adapter endpoint were compromised and returned malicious content, the CSP could mitigate script injection.

**Mitigating factors**:
- All fetch responses are consumed as JSON and parsed explicitly with type assertions
- No `.innerHTML`, `dangerouslySetInnerHTML`, or similar DOM injection
- Responses are validated with shape checks before use (e.g. `typeof json.total_output !== "number"`)
- React's default XSS protection applies to all JSX rendering

**Recommendation**: Add a strict CSP before mainnet deploy:
```
Content-Security-Policy: default-src 'self'; connect-src 'self' https://agg-api.minswap.org https://api-us.dexhunterv3.app https://yoroi.steelswap.io https://cardexscan.com https://saturnswap.io https://cardano-preprod.blockfrost.io https://cardano-mainnet.blockfrost.io; script-src 'self'; style-src 'self' 'unsafe-inline';
```

---

## No Issues Found

### Auth handling
- All API keys are optional; adapters handle missing keys gracefully
- No basic auth, bearer tokens, or session secrets in codebase
- Wallet keys never leave the wallet extension (CIP-30 security model)

### Error handling
- All fetch calls wrapped in try/catch; failures return structured `QuoteAdapterFailure` objects
- No stack traces or internal paths leaked to UI
- Rejected wallet signatures caught and displayed as user-facing error messages

### Input validation
- `slippageTolerancePct` validated in `src/domain/validation.ts` (must be finite, >0, ≤100)
- Amount must be positive number
- Asset IDs must match known tokens in `requireAsset()`
- Network constrained to `LIVE_QUOTE_NETWORK` or `EXECUTABLE_NETWORK` constants

### Network isolation
- Mainnet execution lock: `EXECUTABLE_NETWORK = "preprod"` is a compile-time constant
- `handleExecuteSwap` checks `route.source.quoteMode === "mock"` — no live API call on preprod
- Live adapters reject non-mainnet requests at the top of `getQuotes()`

### Transaction safety
- Refresh-mismatch gate: `comparePreviewToRefreshedRoute()` blocks execution if quote changed materially
- Preview approval captured in ref before execution begins
- No transaction built or signed without explicit user action (button click + wallet popup)

### Dependency risk
- No WASM dependencies
- No native modules or binary dependencies
- Dependencies are standard Vite/React stack: React, TypeScript, lucide-react, vitest, playwright

---

## Verdict

The app is safe to deploy as a prototype / demo. Two low-severity findings identified (API key exposure in bundle, missing CSP).

**Before mainnet launch, must address**:
- [ ] Add CSP headers (S-2)
- [ ] Document API key exposure risk in deploy guide (S-1)
- [ ] Consider proxy server for API key injection (S-1, longer-term)
- [ ] Re-run this security review (ensure nothing regressed)
