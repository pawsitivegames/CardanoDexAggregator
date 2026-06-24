# T1.1 — Infrastructure decision (Phase 1)

**Status:** DECIDED 2026-06-12 (Opus). Owner: human must provision accounts/keys.
**Scope:** Read-only chain access for the Phase 1 routing engine. Execution/submit infra
is revisited at T2.1 and scaled at T4.4.

## Decision

**Primary: Maestro entry tier. Fallbacks: Blockfrost (free) + Koios (free).**

Rationale (per plan §0.5, "cheapest-viable"):
- Maestro entry tier gives UTxO state + datum resolution + a mempool-aware DEX price API +
  Tx Manager submit in one provider, at ~$0–80/mo with near-zero ops. This matches the
  Phase 1 need (quote from raw on-chain pool state) and the Phase 2 need (submit) without a
  provider switch.
- Blockfrost is already wired as a server-side proxy (`server.mjs`, `.env.example` has
  `BLOCKFROST_*_PROJECT_ID` for mainnet/preprod/preview). It stays as the zero-cost
  fallback and the reference implementation for the `PoolStateProvider` interface (T1.4).
- Koios (free, community) is the third leg for redundancy on UTxO/datum reads.

**Why not Demeter (Ogmios+Kupo) for the MVP:** Demeter is the documented *alternative*
(plan §0.5) and the natural bridge to self-hosting at T4.4 (same Ogmios+Kupo code paths as
the future Hetzner node). It is preferred *only if the human wants open APIs / no
proprietary lock-in now*. We default to Maestro for the MVP because it removes the Kupo
pattern-config + sync-wait ops burden during the make-or-break Phase 1. The
`PoolStateProvider` abstraction (T1.4) keeps Demeter/Ogmios a drop-in later — no migration
cost, per plan §0.5.

## Provider matrix

| Capability            | Maestro (primary) | Blockfrost (fallback) | Koios (fallback) |
|-----------------------|-------------------|-----------------------|------------------|
| UTxOs at script addr  | ✅                | ✅                    | ✅               |
| Datum resolution      | ✅                | ✅ (datum endpoint)   | ✅               |
| Chain tip / slot      | ✅                | ✅                    | ✅               |
| Mempool-aware DEX px  | ✅ (entry tier)   | ❌                    | ❌               |
| Raw tx submit         | ✅ (Tx Manager)   | ✅                    | ✅               |
| Cost                  | ~$0–80/mo         | free tier             | free             |

`PoolStateProvider` (T1.4) abstracts the first five rows so any provider is swappable.

## Human action required

Create accounts and put keys in `.env` (server-side only; never `VITE_`-prefixed):

```
# Maestro (primary) — https://gomaestro.org
MAESTRO_MAINNET_API_KEY=...
MAESTRO_PREPROD_API_KEY=...
MAESTRO_PREVIEW_API_KEY=...
# Blockfrost (fallback) — already documented in .env.example
BLOCKFROST_MAINNET_PROJECT_ID=...
BLOCKFROST_PREPROD_PROJECT_ID=...
BLOCKFROST_PREVIEW_PROJECT_ID=...
# Koios needs no key for the free tier.
```

The matching server-side proxy prefixes (`/api/maestro/mainnet`,
`/api/maestro/preprod`, `/api/maestro/preview`) are wired in `server.mjs`
alongside the existing Blockfrost proxies.

## Re-check triggers (per plan standing risks)

- Keep infra spend < $100/mo until Phase 4 (risk §1).
- If Maestro entry-tier rate limits bite during the T1.10 benchmark, promote Blockfrost +
  Koios round-robin before paying for a higher Maestro tier.
- Revisit at T1.8 (Iris evaluation) and T4.4 (self-hosted Hetzner node + Ogmios + Kupo).
