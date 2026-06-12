# Decisions

This file records product and technical decisions that must hold before
ClearRoute can claim live quote quality or transaction executability.

## Accepted

### D01: Mainnet Lock

Mainnet is disabled. The app may not request mainnet signatures or submit
mainnet transactions until read-only quotes, wallet gating, non-mainnet
execution, preview integrity, and security gates pass.

### D02: Asset Identity

Use Cardano asset IDs internally for route requests, quote candidates, balances,
and transaction previews. Symbols, tickers, and token names are display metadata
only and must not be used as unique identifiers.

### D03: Fee Visibility

Route output must expose known costs separately: DEX fees, batcher fees, network
fees, aggregator fees if any, deposits, and min-ADA effects. Route ranking is
based on net output after known costs and policy filters.

### D04: Mock Mode

The product is mock-only today. Mock quote mode must be visible in the UI and
represented in the data model until live quote adapters exist. Mock routes are
not executable.

### D05: First Read-Only DEX Quote Source

Use the Minswap Aggregator API `/aggregator/estimate` endpoint as the first live
read-only quote source. Do not call `/aggregator/build-tx`,
`/aggregator/finalize-and-submit-tx`, or any signing/submission endpoint in the
read-only quote milestone.

### D06: First Quote Network

Use Minswap mainnet market data for read-only quote discovery because the public
aggregator endpoint is mainnet-oriented. This does not unlock mainnet execution:
wallet signing, transaction building, and transaction submission remain disabled.

### D07: First Live Pair And Metadata Source

Use ADA (`lovelace`) to SNEK
(`279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b`) as the
first live pair. Token metadata for this milestone comes from Minswap's token
search/estimate responses and is used only for display; Cardano asset IDs remain
the internal identity.

### D08: Browser API First

Call the read-only Minswap estimate API directly from the browser for the first
demo because it needs no wallet secret, no signing material, and no API key.
Move behind a backend proxy if CORS, rate limiting, request integrity,
observability, or partner attribution becomes a production requirement.

### D09: Wallet Context Without Signing

CIP-30 wallet integration may discover wallets, call `enable()`, read
`getNetworkId()`, and read `getBalance()` for network and balance checks. It may
not call transaction signing, data signing, transaction submission, or
transaction-building flows until the non-mainnet execution path is designed and
approved.

### D10: Transaction Preview Before Execution

The app may construct a transaction preview proof from the selected route and
wallet context before any transaction builder exists. The preview must include
wallet/network context, input/output asset IDs, expected output, minimum
received, DEX/route hops, full fee breakdown, slippage, quote source, quote age,
expiration, and executable route ID. A refreshed quote must match the approved
preview before any future unsigned transaction build. Current routes remain
blocked because no non-mainnet executable builder/sign/submit path has been
selected.

### D11: First Executable Non-Mainnet Path

Use the **Minswap Aggregator API** (`POST /build-tx`, `POST
/finalize-and-submit-tx`) on **preprod testnet** as the first executable
non-mainnet swap path. Use **ADA (`lovelace`) to MIN**
(`29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e`) as the
first executable pair because the Minswap V2 pool on preprod has known
liquidity for this pair and the Minswap SDK examples confirm the setup.

The build-tx endpoint requires the sender's wallet address. The wallet must
provide `getUsedAddresses()` (for the sender address) and `signTx()` (for
signing the unsigned CBOR transaction). The signed witness set is submitted
via `/finalize-and-submit-tx` which returns the transaction ID for tracking.

Transaction tracking uses Blockfrost's `GET /txs/{hash}` endpoint to poll for
confirmation. Blockfrost is preferred over manual node queries because it
requires no infrastructure and provides a simple REST API.

Mainnet executable swaps remain locked until this non-mainnet path is
implemented, verified, and security-reviewed.

### D12: Generic Adapter Factory for Aggregator DEXes

Use a parameterized factory function `createAggregatorLiveAdapter(config)` that
produces a `QuoteAdapter` for any DEX supported by the Minswap Aggregator's
`/estimate` endpoint, rather than writing one adapter per DEX. The config
specifies `id`, `displayName`, `protocol` string (passed as
`include_protocols`), and the supported `pair`. This avoids N nearly-identical
adapter implementations and keeps the per-DEX surface to a single config object.
SundaeSwap V3 is the first second adapter created with this factory.

### D13: Browser-First Execution Path

Extend D08 (browser-first read-only quotes) to the execution path. Call the
Minswap Aggregator's `/build-tx` and `/finalize-and-submit-tx` endpoints
directly from the browser. No backend proxy is needed because:
- The unsigned CBOR contains no secrets.
- The wallet's `signTx()` runs in-browser and never exposes keys.
- The witness set is submitted directly to the Aggregator, which relays it to
  the Cardano network.

Transaction confirmation polling uses the Blockfrost REST API
(`GET /txs/{hash}`) called directly from the browser, keyed by
`VITE_BLOCKFROST_PROJECT_ID`. Blockfrost's free tier is sufficient for
low-volume testnet swaps.

### D14: Adapter Health Per Request

Each adapter call produces a per-request health indicator rather than a
persistent connection health check. An adapter is "healthy" if its latest
`getQuotes()` call returned within the timeout and produced valid normalized
data, "stale" if it returned a failure, and "unavailable" if it threw or timed
out. Health is displayed as a colored dot next to each adapter name in the
route table. This avoids the complexity of background health-check pings and
keeps health scoped to the actual user experience.
