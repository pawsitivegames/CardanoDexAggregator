# DexHunter Adapter — Deep Research

## API Overview

- **Base URL**: `https://api-us.dexhunterv3.app`
- **Charts API**: `https://charts.dhapi.io`
- **Auth**: `X-Partner-Id` header (API key from `app.dexhunter.io/partners`)
- **Docs**: https://dexhunter.gitbook.io/dexhunter-partners

## Partner Setup

1. Go to `app.dexhunter.io/partners`
2. Connect Cardano wallet
3. Enter company name + fee percentage (min 0.01%)
4. Receive `partnerName` + `partnerCode` (API key = `partnerCode`)
- Revenue share: earns fee % on every swap through your integration

## Key Endpoints for Adapter

### Read-Only (Quotes)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/swap/estimate` | POST | Get swap quote without building tx |
| `/swap/tokens` | GET | Search tokens by name/ticker/policy |
| `/swap/adaValue` | GET | ADA price in USD |
| `/swap/averagePrice/ADA/{id}` | GET | Token price in ADA |

### Executable (Build → Sign → Submit)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/swap/build` | POST | Build market swap → returns CBOR |
| `/swap/sign` | POST | Add witness → returns signed CBOR |

### Advanced Trading
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/swap/limit/build` | POST | Build limit order |
| `/swap/limit/estimate` | POST | Get limit order quote |
| `/dca/create` | POST | Build DCA order |
| `/swap/cancel` | POST | Cancel single order |
| `/swap/bulkcancel` | POST | Cancel multiple orders |

## Transaction Flow (vs Minswap Agg)

**DexHunter** (4-step):
```
1. POST /swap/build           →  { cbor, total_input, total_output, splits }
2. wallet.signTx(cbor, true)  →  signatures
3. POST /swap/sign            →  { cbor: signedCbor }
   body: { txCbor: cbor, signatures }
4. wallet.submitTx(signedCbor)→  txHash
```

**Minswap Agg** (3-step):
```
1. POST /build-tx             →  { cbor }
2. wallet.signTx(cbor, true)  →  signatures
3. POST /finalize-and-submit-tx →  txHash
   body: { tx_cbor, witness_set }
```

**Key differences**:
- DexHunter has separate `/swap/sign` step (POST with txCbor + signatures → returns signed CBOR)
- Minswap Agg combines signing + submission in one `/finalize-and-submit-tx` call
- DexHunter leaves final submission to the client (`wallet.submitTx`)
- Minswap Agg handles submission server-side

## /swap/estimate Request/Response

### Request
```json
{
  "token_in": "",                        // "" for ADA, otherwise full token ID
  "token_out": "0691b2fe...49474854",   // full token ID
  "amount_in": 100,                      // number (ADA units for ADA, or token units)
  "slippage": 2,                         // percentage (2 = 2%)
  "blacklisted_dexes": []                // optional: array of DEX codes
}
```

### Response
```json
{
  "total_output": 1000,
  "total_output_without_slippage": 1020,
  "possible_routes": [
    {
      "dex": "MINSWAP",
      "amount_in": 50,
      "expected_output": 510
    },
    {
      "dex": "SUNDAESWAP",
      "amount_in": 50,
      "expected_output": 508
    }
  ]
}
```

**Note**: No `buyer_address` needed for estimate (only for build). No `amount_in_decimal` flag (unlike Minswap Agg). No `include_protocols` filter — use `blacklisted_dexes` to exclude.

## /swap/build Request/Response

### Request
```json
{
  "buyer_address": "addr1...",           // wallet address
  "token_in": "",                        // "" for ADA
  "token_out": "0691b2fe...49474854",   // full token ID
  "amount_in": 100,                      // number
  "slippage": 2,                         // percentage
  "blacklisted_dexes": []                // optional
}
```

### Response
```json
{
  "cbor": "84a300d81858268201...",       // hex CBOR to sign
  "total_input": 100,
  "total_output": 1000,
  "splits": [
    {
      "dex": "MINSWAP",
      "amount_in": 50,
      "expected_output": 510
    }
  ]
}
```

## /swap/sign Request/Response

### Request
```json
{
  "txCbor": "84a300d81858268201...",     // original CBOR from /swap/build
  "signatures": [                         // from wallet.signTx(cbor, true)
    "82820100d8185826..."
  ]
}
```

### Response
```json
{
  "cbor": "a100d81858268201..."          // fully signed CBOR, ready for submission
}
```

## DEX Identifiers (15 supported)

| Code | Name | Swap | Limit | DCA |
|------|------|------|-------|-----|
| `MINSWAP` | MinSwap V1 | ✓ | ✓ | ✓ |
| `MINSWAPV2` | Minswap V2 | ✓ | ✓ | ✓ |
| `MS2HOP` | Minswap V2 Hop | ✓ | ✓ | ✓ |
| `SUNDAESWAP` | Sundae V1 | ✓ | ✓ | ✓ |
| `SUNDAESWAPV3` | Sundae V3 | ✓ | ✓ | ✓ |
| `WINGRIDER` | WingRiders | ✓ | ✓ | ✓ |
| `WINGRIDERV2` | WingRiders V2 | ✓ | ✓ | ✓ |
| `SPLASH` | Splash | ✓ | ✓ | ✓ |
| `VYFI` | VyFinance | ✓ | ✓ | ✓ |
| `MUESLISWAP` | MuesliSwap | ✓ | | |
| `CSWAP` | CSWAP | ✓ | ✓ | ✓ |
| `CHADSWAP` | ChadSwap | ✓ | ✓ | |
| `SNEKFUN` | SnekFun | ✓ | | |
| `CHAKRA` | Chakra | ✓ | | |
| `SHADOWBOOK` | Shadow Book | ✓ | | |

**Note**: MuesliSwap, SnekFun, Chakra only support instant swaps (no limit/DCA).
ChadSwap and Shadow Book do not support DCA.

## Fee Model

DexHunter partner model:
- Partner sets fee percentage during account creation (min 0.01%)
- Partner earns that % on every swap volume through their integration
- API does NOT expose fee breakdown per swap (no `total_lp_fee`, `total_dex_fee`, etc.)
- Fee revenue is tracked server-side in partner dashboard

**Implication for adapter**: We cannot extract fee breakdown from DexHunter's estimate response like we do with Minswap Agg. The `/swap/estimate` response only has `total_output` and `total_output_without_slippage`. We'll need to:
1. Use `total_output_without_slippage` - `total_output` as an implied slippage/safety margin
2. Set all fee components to unknown values (or derive from price impact)
3. Mark `feeBreakdown` appropriately

## Adaptation Strategy

### QuoteAdapter changes needed:
1. New adapter type: `DexHunterLiveAdapter` implementing `QuoteAdapter`
2. For `/swap/estimate`: POST with `{ token_in, token_out, amount_in, slippage, blacklisted_dexes }`  
   → Parse `total_output`, `total_output_without_slippage`, `possible_routes`  
   → Map to `QuoteAdapterSuccess` with synthetic fee breakdown
3. For `/swap/build`: POST with `{ buyer_address, token_in, token_out, amount_in, slippage, blacklisted_dexes }`  
   → Returns `{ cbor, splits }`  
   → Need `executable: true` routes
4. `executable` field: should be `true` when network matches executable network
5. Fee handling: No fee breakdown available from DexHunter estimate API  
   → Set `dexFeeAda: 0` (can't determine), `aggregatorFeeAda: 0`  
   → Note in the quote that fees are included in output

## Registration

Register in the adapter registry (need to find where adapters are registered):
- Add `dexHunterReadOnlyAdapter` to the adapters list
- Similar to how `minswapLiveReadOnlyAdapter`, `sundaeSwapLiveReadOnlyAdapter`, `mockAdapter` are registered

## Open Questions

1. **Does `/swap/estimate` work for any token pair (not just ADA→token)?**  
   - Yes: `token_in` and `token_out` can be any tokens
   - For token→ADA: `token_out: ""`
   - For token→token: both are full token IDs

2. **What's the `amount_in` unit for tokens (not ADA)?**  
   - For ADA (`token_in: ""`): `amount_in` is in ADA units  
   - For tokens: `amount_in` is in token units (smallest unit, like lovelace-equivalent)

3. **No testnet endpoint?**  
   - Docs only list production `https://api-us.dexhunterv3.app`  
   - Same problem as Minswap Agg — no documented testnet/preprod API

4. **Does DexHunter support `amount_in_decimal`?**  
   - No mention in docs. Minswap Agg has this flag.  
   - `amount_in` appears to be raw number. Need to test what unit.

## Next Steps

1. Create `src/adapters/dexHunterLiveAdapter.ts` with:
   - `DEX_HUNTER_BASE_URL` config
   - `DEX_HUNTER_PARTNER_ID` env var
   - `/swap/estimate` call in `getQuotes`
   - Normalize response to `QuoteAdapterSuccess`
   - Error handling (timeout, malformed, HTTP errors)
   - Executable path (build → sign → submit) in a separate function
2. Register adapter in main adapter registry
3. Add config to `src/config/networks.ts`
4. Write unit tests
5. Add mock simulation to `mockAdapter.ts`
