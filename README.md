# ClearRoute Cardano DEX Aggregator

ClearRoute is a Vite/React prototype for exploring Cardano swap route ranking,
comparing live quotes from 6 DEX aggregators, and executing non-mainnet mock swaps.
Mainnet execution remains locked.

## Current Status

- **Mock route simulator** with 5 executable routes on preprod (Minswap, DexHunter,
  Steelswap, Cardexscan, SaturnSwap) plus 3 direct mock routes and an aggregated
  split route for mainnet.
- **6 live read-only adapters** — Minswap Aggregator, SundaeSwap (via Minswap Agg),
  DexHunter, Steelswap, Cardexscan, SaturnSwap. All return estimates from their
  respective REST APIs. None are executable (read-only quotes only).
- Route ranking extracted into the domain layer and exercised by tests.
- CIP-30 wallet discovery, connection, network ID, balance checks, address
  retrieval, and transaction signing.
- Transaction preview proof, refresh-mismatch checks, and mock executable swap
  flow (simulated build → sign → submit cycle with fake tx hash).
- Improvement buffer slider, adapter health indicators, rejection reason labels,
  and executability gating.
- Mainnet must stay locked until non-mainnet execution and security gates pass.

## Protocol Coverage

| Aggregator | Protocols | Model | Auth |
|------------|-----------|-------|------|
| **Minswap Agg** | MinswapV2, Minswap, MinswapStable, MuesliSwap, Splash, SundaeSwapV3, SundaeSwap, SundaeSwapStable, VyFinance, CswapV1, WingRidersV2, WingRiders, WingRidersStableV2, Spectrum, SplashStable, ChakraBondingCurve, OpenDjedV1, DanogoCLMMV1 | AMM routing | None |
| **DexHunter** | 15 DEXes (incl. Minswap, SundaeSwap, WingRiders, VyFinance, GeniusYield, Indigo, Liqwid, etc.) | AMM routing | `X-Partner-Id` header |
| **Steelswap** | 14 DEXes (incl. SundaeSwap, Minswap, WingRiders, VyFinance, Spectrum, etc.) | AMM routing | Optional `partner` param |
| **Cardexscan** | Multi-DEX + ShadowBook (orderbook) + P2P OTC | AMM + orderbook + P2P | `CARDEXSCAN_API_KEY` header |
| **SaturnSwap** | SaturnSwap CLOB (order book) | CLOB (instant, no batcher) | `SATURN_API_KEY` header |

## Setup

```sh
npm install
```

Create a `.env` file in the project root:

```sh
# Required for Blockfrost transaction tracking (optional — leave empty to skip tracking)
VITE_BLOCKFROST_PROJECT_ID=preprodYourBlockfrostProjectIdHere

# Optional API keys for live adapters
VITE_DEXHUNTER_PARTNER_ID=yourDexHunterPartnerId
VITE_STEELSWAP_PARTNER=clearroute-aggregator
VITE_CARDEXSCAN_API_KEY=yourCardexscanApiKey
VITE_SATURN_API_KEY=yourSaturnApiKey
```

> **Security note**: `VITE_*` environment variables are inlined into the client-side
> JS bundle at build time. Anyone inspecting the built `dist/assets/*.js` can read
> these values. For production, route live adapter calls through a proxy server
> that injects API keys server-side, or accept that these keys are public.
> This is inherent to the Vite/static-site architecture — all API keys in
> browser apps are similarly exposed.

Run the app:

```sh
npm run dev       # development server
npm run build     # production build
npm test          # 62 unit tests
```

## Trust Boundary

ClearRoute can execute non-mainnet (preprod) mock swaps only. Mainnet signing,
submission, and execution must remain locked until the mainnet release gate
checklist is fully verified. The app enforces network checks, executability
gates, preview integrity, and stale-quote rejection before any transaction is
built or signed.
