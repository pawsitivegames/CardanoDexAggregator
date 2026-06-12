# SaturnSwap Adapter — Deep Research

## API Overview

- **Base URL (REST)**: `https://saturnswap.io/api/defi`
- **Base URL (GraphQL)**: `https://api.saturnswap.io/v1/graphql/`
- **Docs**: `docs.saturnswap.io`
- **Auth**: `SATURN_API_KEY` (required for CLOB/REST, optional for AMM facade)
- **Model**: Central Limit Order Book (CLOB) — instant swaps, no batcher
- **Audience**: Audited by two firms
- **Cross-chain**: 119 chains via Saturn UEX

## Unique Architecture — CLOB, not AMM Aggregator

SaturnSwap is fundamentally different from Minswap Agg, DexHunter, Steelswap, and Cardexscan:

| Feature | SaturnSwap | Other Aggregators |
|---------|-----------|-------------------|
| **Trade model** | CLOB (order book) | AMM routing |
| **Execution** | Instant (direct SC interaction) | Batcher rounds (minutes) |
| **Batcher** | None needed | Required |
| **Limit orders** | Native (CLOB) | Via API (DexHunter) or not (Steelswap) |
| **Smart contract** | Direct swap via Saturn SCs | Route through external DEX SCs |

> "Saturn Swap changes the model, allowing users to directly interact with the smart contracts for instant trades." — docs.saturnswap.io

## Key Endpoints (from Dexter SDK — production integration)

### Read-only (Quotes)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/aggregator/assets` | GET | List all available assets |
| `/v1/aggregator/orderbook` | GET | Get order book for a pair |
| `/v1/aggregator/quote` | POST | Get swap quote by asset |

### Executable (Build)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/aggregator/simple/create-order-transaction` | POST | Build market swap tx |
| `/v1/aggregator/simple/create-from-asset` | POST | Build from asset (convenience) |
| `/v1/aggregator/advanced/sign-order-transaction` | POST | Pre-cosign flow |
| `/v1/aggregator/simple/submit-order-transaction` | POST | Submit signed tx via API |

## Transaction Flows

### Option A: Simple (local sign + submit) — Preferred for browser wallets
```
1. POST /v1/aggregator/simple/create-from-asset   →  hex tx
   body: {
     asset: "<policyId><assetNameHex>",
     direction: 3,                       // 3 = sell ADA→token, 4 = sell token→ADA
     tokenAmountSell: 1.0,               // display units (ADA)
     tokenAmountBuy: 0,
     slippage: null,
     paymentAddress: "addr1..."
   }
   response: { hex: "84a300d818..." }    // unsigned tx hex
2. wallet.signTx(hex)                     →  witness
3. wallet.submitTx(signedCbor)            →  txHash
```

### Option B: Full API flow (server-side submit)
```
1. POST /v1/aggregator/simple/create-order-transaction   →  hex
2. POST /v1/aggregator/advanced/sign-order-transaction   →  signed hex
3. POST /v1/aggregator/simple/submit-order-transaction   →  txHash
```

### Option C: Dexter convenience (full lifecycle)
```typescript
saturn.buildFromAssetSignSubmit(input, wallet) → txHash
```

## Direction Enum
| Value | Meaning |
|-------|---------|
| 3 | Sell ADA for tokens (ADA → token) |
| 4 | Sell tokens for ADA (token → ADA) |

## Fee Model
- **CLOB trading fees**: Standard SaturnSwap fee structure
- **No batcher fee** (instant execution, no batcher)
- **Cardano network fees** apply (as with all transactions)
- AMM facade: No API key required, standard AMM pricing

## Key Differences from Other Aggregators

| Aspect | SaturnSwap | DexHunter/Steelswap/Cardexscan |
|--------|-----------|-------------------------------|
| Execution speed | Instant | Minutes (batcher rounds) |
| Tx format | Hex | CBOR |
| Quote API | POST quote | POST estimate |
| Auth key | SATURN_API_KEY | varies |
| Liquidity source | SaturnSwap SCs + orderbook | External DEX pools |
| Limit orders | Native CLOB | via separate APIs |
| Cross-chain | 119 chains | None |
| Display units | ADA (not lovelace) | varies |

## Adaptation Strategy

### Read-only adapter:
- `/v1/aggregator/quote` → parse output amount
- No batcher fees to extract (only network fees)
- Map CLOB quote to our RouteCandidate format

### Executable adapter:
- `/v1/aggregator/simple/create-from-asset` → hex tx
- Local sign (`wallet.signTx`) → submit (`wallet.submitTx`)
- Set `executable: true` when network matches

### Config:
- Add `SATURNSWAP_BASE_URL` to networks config
- Add `SATURNSWAP_API_KEY` env var
- Create `src/adapters/saturnSwapLiveAdapter.ts`

## Integration Points

### From Dexter SDK (production reference):
```typescript
// SaturnSwapApi class
const saturnApi = new SaturnSwapApi({ apiKey: process.env.SATURN_API_KEY });

// Quote
const quote = await saturnApi.quoteByAsset({
  asset: tokenId,
  direction: 3,
  amount: 1.0
});

// Build
const hex = await saturnApi.createFromAssetHex({
  asset: tokenId,
  direction: 3,
  tokenAmountSell: 1.0,
  tokenAmountBuy: 0,
  slippage: null,
  paymentAddress: walletAddress
});

// Sign + submit locally
const tx = wallet.newTransactionFromHex(hex);
await tx.sign();
await tx.submit();
```

## Next Steps
1. Create `src/adapters/saturnSwapLiveAdapter.ts`
2. Register in adapter list
3. Add mock simulation
4. Write tests
