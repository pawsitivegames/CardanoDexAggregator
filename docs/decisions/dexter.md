# T1.3 — Build vs depend on Dexter

**Status:** DECIDED 2026-06-12 (Opus). Revisit per-protocol as divergences surface.

## What Dexter is (inspected `@indigo-labs/dexter` v5.4.9 in `vendor/reference/dexter`)

- Clean per-DEX abstraction (`src/dex/base-dex.ts`): each DEX implements
  `liquidityPools()` (discover + decode pool UTxOs → `LiquidityPool`),
  `estimatedReceive()` / `estimatedGive()` (quote math, pure bigint),
  `priceImpactPercent()`, `buildSwapOrder()` / `buildCancelSwapOrder()`, `swapOrderFees()`.
- Per-protocol datum definitions in `src/dex/definitions/<dex>/{pool,order}.ts`.
- Coverage matches our priority list: Minswap V1/V2, SundaeSwap V1/V3, WingRiders V1/V2,
  VyFinance, MuesliSwap, Splash.
- **Dependency:** `lucid-cardano` (the *original* Lucid, not Lucid Evolution). Only address
  utils + `buildSwapOrder` use it; `estimatedReceive` is pure bigint and lucid-free.

## Decision

**Depend on Dexter for pool discovery + datum decoding in the MVP. Wrap, don't expose. Port
the quote math per-protocol behind our own `quoteExactIn` and treat the spec as the source
of truth where Dexter diverges.**

Concretely:
1. **Decoding = depend.** Use Dexter's `liquidityPools()` / `liquidityPoolFromUtxo()` to go
   from raw UTxO → normalized pool. This is the highest-value, lowest-risk reuse (datum
   parsing is tedious and Dexter is Catalyst-funded + active).
2. **Quote math = port + verify against spec.** Re-implement `quoteExactIn(pool, amountIn)`
   in each `src/protocols/<name>/` module rather than calling Dexter's `estimatedReceive`
   directly, because the plan's "known quirks" (§1.2) are exactly the places Dexter may lag
   the official spec:
   - Minswap V2: must use **datum reserves, not UTxO value**; per-direction
     `base_fee_a/b_numerator`/10000; dynamic-fee flag.
   - SundaeSwap V3: **decaying fee evaluated at current slot**; subtract accumulated
     `protocol_fees` from ADA reserve.
   - WingRiders V2: true reserves = value − treasury/agent-fee datum fields − staking ADA.
   Each protocol's T1.5 fixture test asserts our `quoteExactIn` is within 0.1% of the
   protocol's *own* API/frontend — Dexter is a cross-check, the spec + live API is the
   oracle. Record any Dexter-vs-spec divergence in the "Divergence log" below.
3. **Run Dexter server-side only.** It pulls `lucid-cardano` (heavy WASM). Our app is a Vite
   React SPA; we do NOT want that in the browser bundle. Dexter's decoders run in the Node
   service (the `server.mjs` successor / future API per G3). The browser calls our quote
   endpoint. This also aligns with "the API is the product, the UI is the demo."
4. **Keep modules swappable** (plan risk §4). The `PoolStateProvider` (T1.4) +
   `PoolSnapshot` registry (T1.6) sit between Dexter and the domain layer, so if Dexter
   stalls we replace one protocol module without touching the router.

## Why not the alternatives

- **Port everything now:** wastes the 60–70% cost saving the plan is built on (§0.1). Datum
  decoding is the tedious part Dexter already solved.
- **Depend fully (call `estimatedReceive` directly):** couples our quotes to Dexter's math
  *and* its possibly-stale fee handling, and the make-or-break Gate 1 is precisely about
  quote accuracy. We must own the math.
- **Lucid-Evolution tension:** Dexter uses old `lucid-cardano`. We isolate it server-side so
  it never collides with the Lucid Evolution choice for *our* tx-building (T2.1). Dexter's
  `buildSwapOrder` is reference-only; we build orders ourselves in Phase 2.

## Divergence log (append as found)

_(empty — populate during T1.5.P as fixtures reveal Dexter-vs-spec gaps)_
