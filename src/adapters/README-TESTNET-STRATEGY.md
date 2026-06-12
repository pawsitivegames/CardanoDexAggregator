# Testnet Strategy — Deep Research

## The Problem

None of the 4 aggregator APIs have documented testnet/preprod endpoints:

| Aggregator | Mainnet URL | Preprod URL | Status |
|-----------|------------|-------------|--------|
| Minswap Agg | `agg-api.minswap.org/aggregator` | `testnet-preprod.minswap.org/aggregator` | 404 (Next.js frontend) |
| DexHunter | `api-us.dexhunterv3.app` | None documented | No testnet |
| Steelswap | `yoroi.steelswap.io` | `apidev.steelswap.io` | Dev server (unknown network) |
| Cardexscan | `cardexscan.com` | None documented | No testnet |

This means **no aggregator build endpoints work on testnet**. We cannot build real unsigned transactions for testnet swaps through any aggregator API.

## Three Viable Strategies

### Strategy 1: Mock Execution (CURRENT — Implemented)
**Status**: ✅ Working in prototype

The app simulates the swap lifecycle on preprod with fake delays and mock tx hashes:
```
Build (800ms delay) → Sign (api.signTx("00", false)) → Submit (600ms delay) → submitted state
```

**Pros**:
- Zero infrastructure
- Demonstrates full UI flow (button → loading → confirmation)
- Wallet sign dialogue fires (real UX feedback)
- Shows explorer link with mock tx hash

**Cons**:
- No real on-chain transaction
- Cannot verify with Blockfrost
- Demo only, not production-ready

### Strategy 2: Local Transaction Building (RECOMMENDED — Target)
**Architecture**: Use Blockfrost API + on-chain data to build transactions locally in the browser

**Key components**:
- **Blockfrost preprod**: `https://cardano-preprod.blockfrost.io/api/v0`
- **CSL (Cardano Serialization Library)**: WASM-based tx building in browser
- **MeshJS**: Higher-level wallet SDK with Blockfrost provider
- **UTxO fetching**: `GET /addresses/{addr}/utxos` from Blockfrost

**Tx building flow**:
```
1. Fetch UTxOs from Blockfrost (preprod)
2. Fetch protocol parameters from Blockfrost (preprod)
3. Build raw transaction with CSL or MeshJS:
   - Input: user's UTxO with ADA
   - Output: target token via DEX pool datum
4. Return unsigned CBOR to wallet
5. wallet.signTx(cbor) → wallet.submitTx(signedCbor)
```

**Pros**:
- Real on-chain transactions on testnet
- Works without aggregator API
- Full control over tx building

**Cons**:
- Requires WASM (CSL) — violates current constraint of no WASM
- Complex — needs to understand each DEX's pool datum structure
- High maintenance — must track DEX pool contract updates

**WASM-free alternative**: Use Blockfrost's own tx submission endpoint + a proxy service
```
Browser → (signed tx CBOR) → POST /api/v0/tx/submit → Blockfrost preprod
```
But Blockfrost cannot BUILD transactions — it can only SUBMIT pre-signed ones.

### Strategy 3: Self-hosted Proxy (ADVANCED)
**Architecture**: Run a backend proxy that connects to testnet nodes and builds transactions

**Options**:
- **Cardano-wallet**: Full REST API with tx building on testnet
- **Ogmios + Kupo**: Build transactions server-side
- **Custom aggregator adapter**: Run a modified aggregator backend connected to testnet

**Flow**:
```
Browser → (our server) → GET /api/proxy/build-tx → (server builds with cardano-wallet/node) → CBOR
Browser → (our server) → POST /api/proxy/submit-tx → (server submits via cardano-submit-api) → txHash
```

**Pros**:
- No WASM in browser
- Real testnet transactions
- Can support all DEXes

**Cons**:
- Requires server infrastructure
- Must maintain proxy service
- Adds latency

## Recommended Path for Prototype

### Phase 1 (current): Mock Execution
Keep the mock execution path for the demo. It proves the UI works end-to-end.

### Phase 2 (next): Blockfrost-based Tx Building (if WASM becomes acceptable)
If we relax the "no WASM" constraint, use MeshJS or Lucid with Blockfrost provider on preprod:
- `BlockfrostProvider` supports `submitTx()` and UTxO queries
- `MeshTxBuilder` can construct simple ADA-transfer transactions
- Complex DEX swaps still require understanding pool datums

### Phase 3 (future): Proxy Service
Build a lightweight Node.js proxy that:
- Uses `cardano-wallet` or Ogmios on preprod
- Exposes `GET /api/proxy/utxos/{addr}` and `POST /api/proxy/submit`
- Client signs locally and submits via proxy

## Blockfrost Preprod Configuration

```
Base URL: https://cardano-preprod.blockfrost.io/api/v0
Project ID: <VITE_BLOCKFROST_PROJECT_ID>
Rate limit: 10 req/s, burst 500
```

Already configured in `src/config/networks.ts`:
```typescript
BLOCKFROST_BASE_URLS = {
  preprod: "https://cardano-preprod.blockfrost.io/api/v0"
}
```

## Key Insight from Research

The `@fluxpointstudios/cardano-defi-agent-skills` npm package shows a mature approach:
- **CLI-only signing**: Private keys never leave the machine
- **REST API tx building**: All aggregators have `build` endpoints
- **Local sign + submit**: Wallet handles signing, Blockfrost handles submission

For a browser dApp, the pattern is:
1. Aggregator API builds tx (on mainnet — can't do on testnet)
2. CIP-30 wallet signs tx
3. Blockfrost submits tx

On testnet, step 1 fails because no aggregator has preprod. The options are:
- Mock step 1 (current)
- Build tx locally with CSL/MeshJS (requires WASM)
- Use a proxy server for step 1

## Conclusion

For the prototype demo: **Mock execution is the right call**. It proves the architecture without requiring WASM or server infrastructure. The wallet signing dialogue in the mock sign step provides realistic UX feedback.

For production testnet: **Blockfrost-based local tx building** is the most practical path, but requires accepting WASM dependencies or building a proxy service.
