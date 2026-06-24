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
# Server-side Maestro keys used by the primary chain-state proxy.
MAESTRO_MAINNET_API_KEY=yourMaestroMainnetKey
MAESTRO_PREPROD_API_KEY=yourMaestroPreprodKey
MAESTRO_PREVIEW_API_KEY=yourMaestroPreviewKey

# Server-side Blockfrost project IDs used by the fallback chain-state proxy.
BLOCKFROST_MAINNET_PROJECT_ID=mainnetYourBlockfrostProjectIdHere
BLOCKFROST_PREPROD_PROJECT_ID=preprodYourBlockfrostProjectIdHere
BLOCKFROST_PREVIEW_PROJECT_ID=previewYourBlockfrostProjectIdHere
CARDEXSCAN_API_BASE_URL=https://cardexscan.com/api/cds
CARDEXSCAN_API_KEY=yourCardexscanApiKey
SATURN_API_KEY=yourSaturnApiKey

# Optional browser-visible partner IDs for live adapters.
VITE_DEXHUNTER_PARTNER_ID=yourDexHunterPartnerId
VITE_STEELSWAP_PARTNER=clearroute-aggregator
```

> **Security note**: only values prefixed with `VITE_` are inlined into the
> browser bundle. Maestro, Blockfrost, Cardexscan, and Saturn keys must stay
> server-side and are injected by the local proxy in `vite.config.ts` or
> `server.mjs`.

Run the app:

```sh
npm run dev       # development server
npm run build     # production build
npm run serve     # serve dist with the Node proxy
npm test          # unit tests
```

## Trust Boundary

ClearRoute can execute non-mainnet (preprod) mock swaps only. Mainnet signing,
submission, and execution must remain locked until the mainnet release gate
checklist is fully verified. The app enforces network checks, executability
gates, preview integrity, and stale-quote rejection before any transaction is
built or signed.
