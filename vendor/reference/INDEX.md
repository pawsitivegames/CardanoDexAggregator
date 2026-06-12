# Cardano DEX Aggregator - Vendored Repository Reference Index

## Overview
This index maps datum definitions and swap/pricing math implementations across all vendored Cardano DEX protocol repositories.

---

## 1. Minswap V2

| Concern | Path | Notes |
|---------|------|-------|
| Pool datum | minswap-dex-v2/lib/amm_dex_v2/types.ak | PoolDatum: reserves, total_liquidity, fees |
| Order datum | minswap-dex-v2/lib/amm_dex_v2/types.ak | OrderDatum: supports SwapExactIn, SwapExactOut, Deposit, Withdraw, ZapOut, PartialSwap |
| Swap/pricing math | minswap-dex-v2/lib/amm_dex_v2/math.ak | calculate_initial_liquidity, calculate_earned_fee_in_fraction |
| Dexter pool decoder | dexter/src/dex/definitions/minswap-v2/pool.ts | Loads PoolDatum from on-chain |
| Dexter order decoder | dexter/src/dex/definitions/minswap-v2/order.ts | Loads OrderDatum from on-chain |
| Dexter swap math | dexter/src/dex/minswap-v2.ts | estimatedReceive, estimatedGive, priceImpactPercent (lines 142-180) |
| MinSwap SDK math | minswap-sdk/src/calculate.ts | calculateSwapExactIn, calculateSwapExactOut (0.3% fee: 997/1000) |
| MinSwap SDK order builder | minswap-sdk/src/dex-v2.ts | Order construction and batching logic |
| Spec reference | minswap-dex-v2/amm-v2-docs/amm-v2-specs.md | Constant Product Formula (x*y=k), batching architecture |
| Charli3 Python reference | charli3-dendrite/src/charli3_dendrite/dexs/amm/minswap.py | MinswapV2Pool, MinswapV2Order dataclasses |

---

## 2. Minswap Stableswap

| Concern | Path | Notes |
|---------|------|-------|
| Pool datum | minswap-stableswap/lib/stableswap/types.ak | PoolDatum: balances, total_liquidity, amp parameter |
| Order datum | minswap-stableswap/lib/stableswap/types.ak | OrderDatum: Exchange, Deposit, Withdraw, WithdrawImbalance, WithdrawOneCoin |
| Swap/pricing math | minswap-stableswap/lib/stableswap/pool_utils.ak | get_d (invariant), get_y (swap curve), uses AMP (amplification) |
| Spec reference | minswap-stableswap/stableswap-docs/stableswap-spec.md | Stableswap invariant math, iterative convergence |
| MinSwap SDK stableswap | minswap-sdk/src/stableswap.ts | StableswapSwapOptions, StableswapOrderOptions builders |
| Charli3 Python reference | charli3-dendrite/src/charli3_dendrite/dexs/amm/minswap.py | StableswapPool, StableswapOrder dataclasses |

---

## 3. SundaeSwap V3

| Concern | Path | Notes |
|---------|------|-------|
| Pool datum | dexter/src/dex/definitions/sundaeswap-v3/pool.ts | Loads from on-chain; supports concentrated liquidity |
| Order datum | dexter/src/dex/definitions/sundaeswap-v3/order.ts | User order actions and redeemers |
| Swap/pricing math | dexter/src/dex/sundaeswap-v3.ts | estimatedReceive, estimatedGive, priceImpactPercent (concentrated liquidity) |
| SundaeSDK V3 types | sundae-sdk/packages/core/src/DatumBuilders/ContractTypes/Contract.v3.ts | V3PoolDatum, PoolRedeemer, strategies |
| SundaeSDK V3 builder | sundae-sdk/packages/core/src/DatumBuilders/DatumBuilder.V3.class.ts | V3-specific order/pool builders |
| SundaeSDK TxBuilder | sundae-sdk/packages/core/src/TxBuilders/TxBuilder.V3.class.ts | V3 transaction building |
| Charli3 Python reference | charli3-dendrite/src/charli3_dendrite/dexs/amm/sundae.py | SundaeV3Pool, SundaeV3Order dataclasses |

---

## 4. WingRiders V2

| Concern | Path | Notes |
|---------|------|-------|
| Pool datum | wingriders-dex-serializer/src/LiquidityPoolDatumV2.ts | RequestValidatorHash, assets, swap/protocol/project fees, treasury |
| Order datum | wingriders-dex-serializer/src/RequestDatumV2.ts | Oil, beneficiary, action (AddLiquidity, RemoveLiquidity, Swap) |
| Swap/pricing math | dexter/src/dex/wingriders-v2.ts | estimatedReceive, estimatedGive, priceImpactPercent (constant product with multi-tier fees) |
| Dexter pool decoder | dexter/src/dex/definitions/wingriders-v2/pool.ts | Loads WingRiders V2 pool |
| Dexter order decoder | dexter/src/dex/definitions/wingriders-v2/order.ts | Loads WingRiders V2 order |
| WingRiders serializer | wingriders-dex-serializer/src/index.ts | Datum serialization/deserialization utilities |
| Charli3 Python reference | charli3-dendrite/src/charli3_dendrite/dexs/amm/wingriders.py | WingridersPool, WingridersOrder dataclasses |

---

## 5. Splash

| Concern | Path | Notes |
|---------|------|-------|
| Pool datum | dexter/src/dex/definitions/splash/pool.ts | On-chain pool state decoder |
| Order datum | dexter/src/dex/definitions/splash/order.ts | User order action decoder |
| Swap/pricing math | dexter/src/dex/splash.ts | estimatedReceive, estimatedGive, priceImpactPercent (lines 154-166+) |
| Charli3 Python reference | charli3-dendrite/src/charli3_dendrite/dexs/amm/splash.py | SplashPool, SplashOrder dataclasses with fees and swap math |

---

## 6. VyFinance

| Concern | Path | Notes |
|---------|------|-------|
| Pool datum | dexter/src/dex/definitions/vyfinance/pool.ts | On-chain pool state decoder |
| Order datum | dexter/src/dex/definitions/vyfinance/order.ts | User order action decoder |
| Swap/pricing math | dexter/src/dex/vyfinance.ts | estimatedReceive, estimatedGive, priceImpactPercent |
| Charli3 Python reference | charli3-dendrite/src/charli3_dendrite/dexs/amm/vyfi.py | VyFiPool, VyFiOrder dataclasses |

---

## 7. MuesliSwap

| Concern | Path | Notes |
|---------|------|-------|
| Pool datum | dexter/src/dex/definitions/muesliswap/pool.ts | On-chain pool state decoder |
| Order datum | dexter/src/dex/definitions/muesliswap/order.ts | User order action decoder |
| Swap/pricing math | dexter/src/dex/muesliswap.ts | estimatedReceive, estimatedGive, priceImpactPercent |
| Charli3 Python reference | charli3-dendrite/src/charli3_dendrite/dexs/amm/muesli.py | MuesliswapPool, MuesliswapOrder dataclasses |

---

## 8. Genius Yield (Order Book)

| Concern | Path | Notes |
|---------|------|-------|
| Order datum | charli3-dendrite/src/charli3_dendrite/dexs/ob/geniusyield.py | GeniusYieldOrder (CONSTR_ID=0), GeniusRational, GeniusContainedFee |
| On-chain decoder | No on-chain decoder in vendored repos | Dexter does not include Genius Yield AMM pool decoder |
| Charli3 reference | charli3-dendrite/src/charli3_dendrite/dexs/ob/geniusyield.py | Full implementation: PartialOrderDatum, GeniusUTxORef, redeemers |

---

## 9. Saturn (Orderbook)

| Concern | Path | Notes |
|---------|------|-------|
| Order datum | charli3-dendrite/src/charli3_dendrite/dexs/ob/saturnswap.py | SaturnSwapSwapDatum, SaturnSwapPaymentDatum, policy/owner/amounts |
| On-chain decoder | **API-only, no on-chain decoder in vendored repos** | No Dexter definitions; handled via SaturnSwap API |
| Charli3 reference | charli3-dendrite/src/charli3_dendrite/dexs/ob/saturnswap.py | SaturnSwapSomeInt, SaturnSwapOutputReference, swap datum structure |

---

## Directory Structure Reference

```
vendor/reference/
├── dexter/                          # Primary TypeScript decoder & swap math
│   └── src/dex/
│       ├── definitions/             # Pool/Order datum definitions
│       │   ├── minswap-v2/
│       │   ├── sundaeswap-v3/
│       │   ├── wingriders-v2/
│       │   ├── splash/
│       │   ├── vyfinance/
│       │   ├── muesliswap/
│       │   └── ...
│       └── *.ts                     # Swap math implementations (estimatedReceive, priceImpactPercent)
│
├── minswap-dex-v2/                  # Minswap V2 on-chain source
│   ├── lib/amm_dex_v2/types.ak      # PoolDatum, OrderDatum, OrderStep
│   ├── lib/amm_dex_v2/math.ak       # Fee & liquidity calculations
│   └── amm-v2-docs/amm-v2-specs.md  # Protocol specification
│
├── minswap-stableswap/              # Minswap Stableswap on-chain source
│   ├── lib/stableswap/types.ak      # PoolDatum, OrderDatum
│   ├── lib/stableswap/pool_utils.ak # Invariant (get_d) and swap (get_y) math
│   └── stableswap-docs/stableswap-spec.md
│
├── minswap-sdk/                     # Minswap SDK (TypeScript)
│   └── src/
│       ├── calculate.ts             # calculateSwapExactIn/Out
│       ├── stableswap.ts            # Stableswap order builder
│       └── dex-v2.ts                # V2 order builder
│
├── sundae-sdk/                      # SundaeSwap SDK (TypeScript)
│   └── packages/core/src/DatumBuilders/
│       └── ContractTypes/Contract.v3.ts
│
├── wingriders-dex-serializer/       # WingRiders datum serialization
│   └── src/
│       ├── LiquidityPoolDatumV2.ts  # Pool datum
│       └── RequestDatumV2.ts        # Order datum
│
├── sundae-contracts/                # (included; no key files analyzed)
├── iris/                            # (included; no key files analyzed)
│
└── charli3-dendrite/                # Python reference implementations
    └── src/charli3_dendrite/dexs/
        ├── amm/                     # AMM implementations
        │   ├── minswap.py           # Minswap V2 & Stableswap
        │   ├── sundae.py            # SundaeSwap V3
        │   ├── wingriders.py        # WingRiders V2
        │   ├── splash.py            # Splash
        │   ├── vyfi.py              # VyFinance
        │   └── muesli.py            # MuesliSwap
        └── ob/                      # Order Book implementations
            ├── geniusyield.py       # Genius Yield order book
            └── saturnswap.py        # Saturn order book
```

---

## Key Findings

1. **Minswap V2**: Constant Product (CPM) with 0.3% base fee; supports batching via factory pattern.
2. **Minswap Stableswap**: Invariant-based; uses AMP parameter for curve shape; iterative convergence solver.
3. **SundaeSwap V3**: Concentrated liquidity; full V3 implementation in dexter and SDK.
4. **WingRiders V2**: Multi-fee structure (swap/protocol/project); serializer provides datum codec.
5. **Splash, VyFinance, MuesliSwap**: All use standard constant-product model; dexter provides unified interface.
6. **Genius Yield**: Order book model; no on-chain pool decoder in vendored repos.
7. **Saturn**: API-only protocol; charli3-dendrite provides Python reference for limit orders.

---

## How to Use This Index

- **For Datum Definitions**: Use Aiken files (minswap-*/) or TypeScript decoders (dexter/src/dex/definitions/)
- **For Swap Math**: Check dexter/src/dex/*.ts for protocol implementations or minswap-sdk/src/ for SDK-level math
- **For Python Reference**: Use charli3-dendrite for edge cases and test data validation
- **For Protocol Specs**: See minswap-dex-v2/amm-v2-docs/ and minswap-stableswap/stableswap-docs/
