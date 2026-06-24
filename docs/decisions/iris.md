# T1.8 - Iris evaluation

**Status:** DECIDED 2026-06-12 (Opus). Revisit at Phase 4 scale-stage infra.

## Decision

Do **not** run Iris for the Phase 1 MVP. Keep the T1.7 active-pair polling cache as the
read path until live Gate 1 proves the router is worth operating.

## Rationale

- The plan's infrastructure target is <$100/mo and near-zero ops through Gate 1. Iris is a
  real multi-DEX indexer with REST/websocket surfaces, but operating it adds database,
  chain-sync, deployment, and monitoring work before the make-or-break quote benchmark.
- T1.7 already limits reads to active pairs and refreshes per block, which matches Phase 1:
  prove quote accuracy and benchmark wins, not full-market indexing.
- Iris remains valuable later because it already models pools, swaps, and orders across
  DEXes. It is the right candidate if the polling cache becomes rate-limited or if the API
  product needs historical swap/order streams.

## Revisit triggers

- Maestro/Blockfrost/Koios polling cannot keep quotes fresh under benchmark or API load.
- Phase 2 settlement tracking needs broad observed-chain order/fill history beyond our own
  submitted orders.
- Phase 4 self-hosting starts; evaluate Iris against the Hetzner node + Ogmios + Kupo
  stack before building duplicate indexer services.

## Current implementation path

Use `PoolStateProvider` implementations for raw chain reads, protocol modules for decode
and math, and `PoolCache` for active-pair freshness. Keep Iris vendored in
`vendor/reference/iris` as a design/reference dependency only.
