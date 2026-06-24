# MuesliSwap Protocol Module

This module implements MuesliSwap AMM pool interaction for the Cardano DEX Aggregator.

## Completed: AMM Pools (Task T1.5)

- **types.ts**: MuesliSwapPool type definition with reserves and fee structure
- **decode.ts**: Pool decoder from CBOR datum, extracting reserves from UTxO assets
- **quote.ts**: Exact-in swap quoter using MuesliSwap CFMM formula with ceiling-based fees
- **quote.test.ts**: Comprehensive test suite covering formula verification, k-invariant properties, monotonicity, and bounds
- **__fixtures__/pools.json**: Realistic test pools with valid Cardano asset units

## Formula Reference

MuesliSwap uses a Minswap-style CFMM with a flat fee applied to the input:

```
swapFee = ceiling((amountIn * feeNumerator) / feeDenominator)
adjustedIn = amountIn - swapFee
out = reserveOut - (reserveIn * reserveOut) / (reserveIn + adjustedIn)
```

All divisions use bigint floor division; fee calculation uses ceiling.

## TODO: MuesliSwap Orderbook (Deferred)

The MuesliSwap orderbook / limit order functionality is deferred to a future book task (not in scope for T1.5).

When implemented, it should:
- Decode MuesliSwap order UTxOs from the order address
- Support order state queries (open, matched, cancelled)
- Extract order parameters: input/output assets, amounts, slippage, expiration
- Possibly integrate with the aggregator's order routing layer

See vendor/reference/dexter/src/dex/muesliswap.ts for additional context.
