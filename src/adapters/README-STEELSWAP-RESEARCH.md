# Steelswap Adapter — Deep Research

## API Overview

- **Base URL (Prod)**: `https://yoroi.steelswap.io`
- **Base URL (Dev)**: `https://apidev.steelswap.io`
- **Swagger UI**: `https://apidev.steelswap.io/docs`
- **ReDoc**: `https://apidev.steelswap.io/redoc`
- **Auth**: None required (token header was removed Nov 2025 — commit 218c66c in lace)
- **Partner param**: Optional `partner` field in request body (e.g., `'yoroi-aggregator'`, `'lace-aggregator'`, `'eternl-aggregator'`, `'farmbot'`)
- **Open source**: Python backend, solo developer, Project Catalyst funded
- **MCP server**: Planned (SteelSwap V2 proposal), IndigoProtocol/indigo-mcp already has Steelswap MCP tools

## Source of Truth

This adapter is already integrated into **two IOG wallets**:
- **Lace wallet** (input-output-hk/lace): `src/features/swaps/`
- **Yoroi wallet** (Emurgo/yoroi): `mobile/packages/swap/adapters/api/steelswap/`

Both are production-grade integrations with extensive testing. This research is based on actual working code in those repositories.

## Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tokens/list/` | GET | Available tokens |
| `/dex/list/` | GET | Supported DEXes |
| `/swap/estimate/` | POST | Get swap estimate |
| `/swap/build/` | POST | Build unsigned tx |
| `/swap/cancel/` | POST | Cancel order |
| `/wallet/history/` | POST | Wallet swap history |
| `/wallet/pending/` | POST | Pending orders |

## Token Format (CRITICAL)

- **ADA**: Use string `"lovelace"` (NOT empty string `""` like Minswap/DexHunter)
- **Tokens**: `<policy_id><asset_name>` concatenated (no dot separator)
- **Quantities**: In **lovelace** units (1 ADA = 1,000,000 lovelace)
  - `1000000` = 1 ADA
  - `10000000` = 10 ADA
- Empty string `""` or `"."` for ADA causes Internal Server Error

## POST /swap/estimate/

### Request
```json
{
  "tokenA": "lovelace",
  "tokenB": "0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa4e49474854",
  "quantity": 1000000,
  "ignoreDexes": [],
  "partner": "yoroi-aggregator",
  "hop": false,
  "da": []
}
```

### Response
```json
{
  "tokenA": "lovelace",
  "quantityA": 2000000,
  "tokenB": "0691b2fe...4e49474854",
  "quantityB": 10000000,
  "totalFee": 10,
  "totalDeposit": 0,
  "steelswapFee": 0,
  "bonusOut": 0,
  "price": 1.93110103443615,
  "splitGroup": []
}
```

### Response Fields
| Field | Type | Description |
|-------|------|-------------|
| `quantityA` | number | Actual input used (lovelace) |
| `quantityB` | number | Expected output (token units) |
| `totalFee` | number | Total fee (lovelace) |
| `totalDeposit` | number | Deposit (lovelace) |
| `steelswapFee` | number | Steelswap fee (always 0 for single-DEX) |
| `bonusOut` | number | Bonus output |
| `price` | number | Calculated price |
| `splitGroup` | array | Routing breakdown |

## POST /swap/build/

### Request
```json
{
  "tokenA": "lovelace",
  "tokenB": "0691b2fe...4e49474854",
  "quantity": 1000000,
  "ignoreDexes": [],
  "partner": "yoroi-aggregator",
  "hop": false,
  "da": [],
  "address": "addr1qx2fx...",
  "slippage": 50,
  "forwardAddress": "",
  "feeAdust": true,
  "collateral": [],
  "pAddress": "",
  "utxos": ["..."],
  "ttl": 900
}
```

### Response
```json
{
  "tx": "84a300d81858268201...",
  "p": false
}
```

### Response Fields
| Field | Type | Description |
|-------|------|-------------|
| `tx` | string | Hex-encoded unsigned transaction |
| `p` | boolean | Whether to use partial signing |

## Transaction Flow (vs Minswap Agg vs DexHunter)

**Steelswap** (3-step, no separate sign endpoint):
```
1. POST /swap/build/          →  { tx: hexTx, p: bool }
2. wallet.signTx(hexTx, p)    →  signatures
3. wallet.submitTx(signedCbor)→  txHash
```

**DexHunter** (4-step, separate sign endpoint):
```
1. POST /swap/build           →  { cbor, splits }
2. wallet.signTx(cbor, true)  →  signatures
3. POST /swap/sign            →  signed cbor
4. wallet.submitTx(signedCbor)→  txHash
```

**Minswap Agg** (3-step, finalize server-side):
```
1. POST /build-tx             →  { cbor }
2. wallet.signTx(cbor, true)  →  signatures
3. POST /finalize-and-submit-tx →  txHash
```

## Supported DEXes (14)

| DEX Identifier | Notes |
|----------------|-------|
| CSWAP | |
| GeniusYield | Exclusive to Steelswap |
| Minswap | |
| MinswapV2 | |
| MinswapV2Router | |
| MuesliSwap | |
| Spectrum | |
| Splash | |
| SplashRouter | |
| SundaeSwap | |
| SundaeSwapV3 | |
| VyFi | |
| WingRiders | |
| WingRidersV2 | |

## Fee Model

- **Single-DEX swaps**: Zero fees (steelswapFee = 0)
- **Multi-DEX swaps**: 1 ADA flat fee
- `totalFee` in response = batcher + network fees
- `totalDeposit` = required deposit
- `steelswapFee` = steel protocol fee (currently 0)

## Adaptation Strategy

### QuoteAdapter changes needed:
1. New adapter: `steelswapLiveAdapter` implementing `QuoteAdapter`
2. `/swap/estimate/` call:
   - Convert ADA input to lovelace (multiply by 1,000,000)
   - Use `"lovelace"` for ADA
   - Parse `quantityB` as output (divide by token decimals)
   - Map `totalFee` + `totalDeposit` to fee breakdown
3. `/swap/build/` call (for executable):
   - Include `address`, `slippage` (basis points), `utxos`
   - Parse `tx` as the unsigned transaction hex
4. `executable: true` when network matches executable network

### Integration:
- Add `STEELSWAP_BASE_URL` to `src/config/networks.ts`
- Create `src/adapters/steelswapLiveAdapter.ts`
- Register in adapter list
- Add mock simulation in `mockAdapter.ts`

## Testing Status (from Yoroi team)

- `GET /tokens/list/` ✅ Working
- `POST /swap/estimate/` ✅ Working
- `POST /wallet/history/` ✅ Working
- `POST /swap/build/` ⚠️ Needs real UTXOs (expected)
- `POST /swap/cancel/` ❌ Returns 500 (needs real tx)

## Open Questions

1. **Does Steelswap have a testnet endpoint?**
   - Only `https://yoroi.steelswap.io` (mainnet) documented in production code
   - `https://apidev.steelswap.io` is dev server (may work on testnet?)

2. **Is the build response `tx` CBOR-hex or a different format?**
   - Yoroi tests show it's a hex-encoded transaction
   - Lace types show `string` — likely CBOR hex like other aggregators

3. **Does Steelswap support token→token swaps?**
   - Lace code supports arbitrary `tokenA`/`tokenB`
   - No documented limitations

4. **Partner code - required or optional?**
   - Yoroi changed from always-required to `...(partner !== undefined && {partner})`
   - Lace always includes `partner: 'lace-aggregator'`
   - Safe to include as optional param

## Next Steps

1. Create `src/adapters/steelswapLiveAdapter.ts`:
   - `STEELSWAP_BASE_URL` = `https://yoroi.steelswap.io`
   - `/swap/estimate/` for read-only quotes
   - `/swap/build/` for executable path
   - Lovelace conversion for quantities
   - "lovelace" string for ADA
   - Optional `partner` param
2. Create network config entries
3. Write unit tests
4. Add mock simulation
