# Cardexscan Adapter — Deep Research

## API Overview

- **Base URL**: `https://cardexscan.com/api/cds`
- **Auth**: `CARDEXSCAN_API_KEY` header (required)
- **License**: MIT for personal use, commercial requires contacting team
- **Rate limiting**: Active
- **GitHub**: `hydracds` (TypeScript codebase)
- **MCP Server**: `@cardexscan/mcp-server` (npm, 24 tools)
- **Features**: Multi-DEX aggregator, P2P OTC marketplace, DCA, trade scooper, portfolio tracker
- **Unique**: Integrates with ShadowBook (orderbook DEX) alongside AMM sources

## Source of Truth
- `hydracds.github.io/api-docs/` (currently 404 but cached samples exist)
- `hydracds/cds-mcp` GitHub repo
- `@fluxpointstudios/cardano-defi-skills` npm package (config reference)

## Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/cds/swap/aggregate` | POST | Get aggregated swap routes (quotes) |
| `/api/cds/swap/cbor/build` | POST | Build unsigned tx CBOR for a swap |
| `/api/otc/offers/create` | POST | Create P2P OTC offer |
| `/api/otc/offers/fill` | POST | Fill/accept an offer |
| `/api/otc/offers` | GET | Get all P2P offers |
| `/api/otc/offers/my` | GET | Get user's offers |
| `/api/otc/offers/cancel` | POST | Cancel an offer |
| `/api/dca/orders/create` | POST | Create DCA order |
| `/api/dca/orders/cancel` | POST | Cancel DCA order |
| `/api/dca/orders` | GET | Get user's DCA orders |
| `/api/dca/orders/all` | GET | All active DCA orders |

## Token Format

- **ADA**: Use string `"lovelace"` (like Steelswap, unlike Minswap/DexHunter `""`)
- **Tokens**: Full token ID with `policyId` + `nameHex`
- **tokenOut format**: Object, not string!
  ```json
  {
    "policyId": "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f",
    "nameHex": "534e454b",
    "decimals": 0,
    "verified": true,
    "ticker": "SNEK"
  }
  ```
- **Quantities**: Raw big integers (not lovelace decimal)

## POST /api/cds/swap/aggregate

### Request
```json
{
  "tokenInAmount": 1000,
  "slippage": 1,
  "tokenIn": "lovelace",
  "tokenOut": {
    "policyId": "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f",
    "nameHex": "534e454b",
    "decimals": 0,
    "verified": false,
    "ticker": "SNEK"
  },
  "blacklisted_dexes": ["CERRA", "GENIUS", "TEDDYSWAP", "SPECTRUM"]
}
```

### Response
```json
{
  "data": {
    "estimatedTotalRecieve": 205611,
    "splits": [
      {
        "estimatedOutput": 146745,
        "dex": "VyFinance",
        "minimumAmount": 145412,
        "priceImpact": 0.2533434871925144,
        "splitPercent": 71.41,
        "amountIn": 714.1,
        "deposits": 2000000,
        "batcherFee": 2000000
      },
      {
        "estimatedOutput": 58744,
        "dex": "WingRiders",
        "minimumAmount": 58162,
        "priceImpact": 0.4592331054831607,
        "splitPercent": 28.59,
        "amountIn": 285.9,
        "deposits": 2000000,
        "batcherFee": 2000000
      }
    ]
  },
  "error": null
}
```

### Response Fields
| Field | Type | Description |
|-------|------|-------------|
| `data.estimatedTotalRecieve` | number | Total expected output |
| `splits[].estimatedOutput` | number | Output from this DEX |
| `splits[].dex` | string | DEX identifier |
| `splits[].minimumAmount` | number | Min output (for slippage) |
| `splits[].priceImpact` | number | Price impact percentage |
| `splits[].splitPercent` | number | % of order routed here |
| `splits[].amountIn` | number | Input to this split |
| `splits[].deposits` | number | Deposit (lovelace) |
| `splits[].batcherFee` | number | Batcher fee (lovelace) |

## POST /api/cds/swap/cbor/build

### Request
```json
{
  "tokenInAmount": 5,
  "slippage": 1,
  "tokenIn": "lovelace",
  "tokenOut": {
    "policyId": "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f",
    "nameHex": "534e454b",
    "decimals": 0,
    "verified": true,
    "ticker": "SNEK"
  },
  "blacklisted_dexes": ["CERRA", "GENIUS", "TEDDYSWAP", "SPECTRUM"],
  "userAddress": "addr1qx2u9j732u24pzdgr7kv5s3mra5hldzgq6spgjclp02urdfsl0pf0vqz942h3gru5cudxjajqme6h886gpg5jdftzcyqqkjcj3"
}
```

### Response
CBOR hex string (unsigned transaction)

## Transaction Flow

**Cardexscan** (3-step, no separate sign endpoint):
```
1. POST /api/cds/swap/cbor/build  →  cbor hex
2. wallet.signTx(cbor, true)      →  signatures
3. wallet.submitTx(signedCbor)    →  txHash
```

## DEX Identifiers (partial, from blacklisted_dexes sample)
- CERRA
- GENIUS (GeniusYield)
- TEDDYSWAP
- SPECTRUM
- VyFinance
- WingRiders
- MINSWAP (likely)
- (Full list needs API discovery)

## Fee Model
- `batcherFee` in lovelace per DEX split
- `deposits` in lovelace per DEX split
- Total fee = sum of all batcherFees + deposits across splits
- These are per-DEX fees, not global

## MCP Server (24 tools across 7 categories)
| Category | Tools |
|----------|-------|
| Tokens | `get_trending_tokens`, `search_tokens`, `get_ada_price` |
| Pools | `get_token_pools`, `get_rug_score` |
| Wallet | `get_wallet_tokens`, `get_pending_orders`, `get_wallet_orders` |
| Swaps | `swap_aggregate`, `swap_build_cbor` |
| Trades | `get_global_trades`, `get_historical_trades`, `get_token_trades`, `submit_swap` |
| OTC/P2P | `get_otc_offers`, `get_otc_offer_by_id`, `create_otc_offer`, `fill_otc_offer`, `get_my_otc_offers`, `cancel_otc_offer` |
| DCA | `create_dca_order`, `cancel_dca_order`, `get_dca_orders`, `get_all_dca_orders` |

## Unique Features (vs other aggregators)
1. **P2P OTC Marketplace**: Direct token-for-token trades without AMM
2. **DCA Engine**: Automated recurring buys with keeper bots
3. **MCP Server**: 24 tools for AI assistant integration
4. **ShadowBook integration**: Orderbook DEX alongside AMM pools
5. **Trade Scooper**: Arbitrage opportunity detection
6. **Portfolio Tracker**: Consolidated wallet view
7. **Rug Score**: Risk assessment for tokens

## Adaptation Strategy

### Read-only adapter:
- Map `/api/cds/swap/aggregate` → quote
- Convert `"lovelace"` for ADA (like Steelswap)
- Convert tokenOut from object to string format
- Parse `estimatedTotalRecieve` as output
- Extract `batcherFee` + `deposits` as fee breakdown
- Map each split to a route hop

### Executable adapter:
- Map `/api/cds/swap/cbor/build` → build tx
- Standard sign → submit pattern
- Requires API key in headers

### Config:
- Add `CARDEXSCAN_BASE_URL` to networks config
- Add `CARDEXSCAN_API_KEY` env var (like Blockfrost)
- Create adapter file

### Open questions:
1. Full DEX list needs discovery
2. Token format for token→token swaps (likely both objects)
3. Is build response just raw CBOR string or wrapped?
4. Does testnet version exist?
