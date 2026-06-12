# ClearRoute Trust Backlog

## Claim To Earn

ClearRoute should eventually be allowed to say:

> This is the best executable Cardano swap route we found for your wallet,
> network, assets, amount, and slippage, ranked by net output after all known
> costs, and the transaction you sign matches this preview.

Today it is a Vite/React prototype with a tested route engine, mock routes, two
live read-only estimate paths (Minswap + SundaeSwap via the Minswap Aggregator
API), CIP-30 wallet network/balance/signing context, a preprod executable
swap path using the Minswap Aggregator API for build/submit and Blockfrost for
tracking, browser smoke tests, and Git metadata in this folder. Mainnet
execution remains locked.

## Demo We Are Actually Building First

The first credible demo is:

1. The app clearly says when it is using mock data.
2. Route ranking is extracted from React and tested.
3. Mock quotes flow through the same adapter contract as future live quotes.
4. One live read-only DEX quote can be fetched, normalized, timestamped, and
   rejected if stale or malformed.
5. A CIP-30 wallet can connect, and wrong network or insufficient balance blocks
   progression.
6. One direct non-mainnet swap can be previewed, refreshed, signed, submitted,
   and tracked.

Only after that do we earn the right to add a second DEX and call this a route
comparator.

## Quality Bar

| Area | Required Standard |
| --- | --- |
| Route identity | Asset IDs internally; symbols only for display |
| Route ranking | Highest net output after known costs and filters |
| Fees | DEX, batcher, network, aggregator, and deposit/min-ADA effects represented |
| Quote source | mock/fixture/live is visible in UI and data model |
| Freshness | stale or expired candidates cannot win or be signed |
| Rejections | every losing route has a reason code |
| Executability | read-only routes cannot enter signing flow |
| Preview integrity | refreshed route must match approved preview before signing |
| Mainnet | disabled until non-mainnet execution and security gates pass |

## Immediate Implementation Queue

Do these in order. Stop after each gate and verify.

## Current Progress

- Completed: T01-T55.
- Verified: `npm run build`, `npm test`, a live Minswap `curl` estimate, and a
  browser DOM smoke check at `http://127.0.0.1:5173/`.
- T46-T55: Code complete. The Minswap Aggregator API (`/build-tx`,
  `/finalize-and-submit-tx`) builds unsigned transactions and submits signed
  ones on preprod. The CIP-30 wallet layer exposes `signTx()` and
  `getUsedAddresses()`. Blockfrost polling tracks confirmation. Two live
  adapters (Minswap, SundaeSwap) compete via the same adapter contract.
  Improvement buffer, adapter health indicators, rejection reason labels, and
  executability gating are wired in the UI.
- Still requires: A real preprod wallet connection with testnet ADA to exercise
  the full build → sign → submit → track flow end to end, and a Blockfrost
  project ID for tx confirmation polling.

### 1. Make The Mock Impossible To Misread

**Why:** A finance/trading UI with mock data must be visibly fake until it is not.

| Ticket | Change | Proof |
| --- | --- | --- |
| T01 | Add `.gitignore` | `node_modules`, `dist`, env files, logs, coverage ignored |
| T02 | Decide Git root | `git status` works here or README documents parent strategy |
| T03 | Add `README.md` | States mock-only, setup commands, and missing real features |
| T04 | Add `docs/ARCHITECTURE.md` | UI/domain/adapters/wallet/transactions boundaries documented |
| T05 | Add `docs/DECISIONS.md` | mainnet lock, asset IDs, fee visibility, mock mode recorded |
| T06 | Add visible mock badge | UI text includes `Mock quote simulation` |
| T07 | Tighten product copy | No wording implies live quotes or executable swaps |

**Gate:** `npm run build` passes and the first viewport clearly shows mock mode.

**Still forbidden after this:** live quote claims, wallet signing, mainnet.

### 2. Extract Route Logic From React

**Why:** If best-route logic is not testable outside the UI, it is not safe
enough to connect to real quotes.

| Ticket | Change | Proof |
| --- | --- | --- |
| T08 | Add `src/domain/assets.ts` | asset ID and display metadata types compile |
| T09 | Add `src/domain/fees.ts` | structured fee breakdown type compiles |
| T10 | Add `src/domain/routes.ts` | candidate/decision/rejection types compile |
| T11 | Add `src/domain/validation.ts` | invalid requests return typed failures |
| T12 | Add `src/domain/quoteEngine.ts` | engine ranks candidates without React |
| T13 | Move mock token/venue data out of `src/main.tsx` | React imports mock/domain modules |
| T14 | Render engine output in `src/main.tsx` | UI behavior stays equivalent |

**Route decision output must include:**

- request
- status
- selected route
- rejected routes
- candidate routes
- warnings
- quote mode
- decision timestamp

**Rejection reasons must include:**

- invalid request
- worse net output
- stale quote
- failed source
- unsupported pair
- insufficient liquidity
- excessive price impact
- below improvement buffer
- non-executable route

**Gate:** `npm run build` passes and `src/main.tsx` no longer owns route ranking.

**Still forbidden after this:** live DEX integration, wallet signing, mainnet.

### 3. Prove The Route Engine

**Why:** This is the core safety surface. Tests are the cheapest place to catch
wrong-route bugs.

| Ticket | Test | Proof |
| --- | --- | --- |
| T15 | Add Vitest | `npm test` runs |
| T16 | Net output beats gross output | gross winner can lose |
| T17 | Fees can flip winner | added fees change selected route |
| T18 | Improvement buffer works | complex route needs meaningful benefit |
| T19 | Stale quote rejected | stale candidate cannot win |
| T20 | Failed source rejected | failed candidate cannot win |
| T21 | Invalid request rejected | zero, negative, same asset, unknown asset fail cleanly |
| T22 | Tie-break deterministic | same input produces same selected route |

**Gate:** `npm run build` and `npm test` pass.

**Still forbidden after this:** wallet signing, mainnet.

### 4. Add The Quote Adapter Spine

**Why:** Mock and live data must enter through the same contract or the tests
will stop protecting the product.

| Ticket | Change | Proof |
| --- | --- | --- |
| T23 | Add `src/adapters/types.ts` | adapter contract compiles |
| T24 | Add `src/adapters/mockAdapter.ts` | existing mock routes come from adapter |
| T25 | Normalize adapter success | engine consumes normalized candidates |
| T26 | Normalize adapter failure | failure becomes rejected route |
| T27 | Add adapter fixtures | success/failure fixtures pass |
| T28 | Show source/executability in UI | mock/fixture/live and read-only/executable visible |

**Adapter result must include:**

- adapter ID and display name
- quote mode: mock, fixture, live
- network
- input/output asset IDs
- gross output
- fee breakdown
- route hops
- quote timestamp
- expiration or max-age policy
- read-only/executable status
- structured error on failure

**Gate:** The current mock UI is powered by `mockAdapter`, and a simulated
adapter failure renders as a rejected route instead of crashing.

**Still forbidden after this:** wallet signing, mainnet.

### 5. Add One Live Read-Only Quote

**Why:** One honest live quote is more valuable than many mocked routes.

Before code, record decisions in `docs/DECISIONS.md`:

- first DEX quote source
- first network
- token metadata source
- browser SDK/API vs backend proxy

| Ticket | Change | Proof |
| --- | --- | --- |
| T29 | Add network config | selected network explicit |
| T30 | Add real asset IDs for first pair | live route does not use symbol-only identity |
| T31 | Implement read-only live adapter | one pair returns normalized candidate |
| T32 | Add timeout/stale/malformed handling | all fail closed |
| T33 | Save real response fixture | fixture normalization test passes |
| T34 | Add live quote UI states | loading/stale/failed/unsupported/no-route visible |

**Gate:** One live quote competes through the same engine as mock quotes, and no
wallet signature prompt exists.

**Still forbidden after this:** transaction signing, mainnet, split routes.

### 6. Add Wallet Context Without Signing

**Why:** Wallet network and balance determine whether a route is actionable.

| Ticket | Change | Proof |
| --- | --- | --- |
| T35 | Discover CIP-30 wallets | available wallets listed |
| T36 | Connect/disconnect wallet | UI reflects wallet state |
| T37 | Read network ID | wrong network detectable |
| T38 | Block unsupported network | CTA disabled with reason |
| T39 | Read input asset balance | supported ADA/native balance check works |
| T40 | Block insufficient balance | CTA disabled with reason |
| T41 | Normalize wallet errors | unavailable/rejected/wrong-network handled consistently |

**Gate:** Wallet connects, bad network/balance blocks progression, and signing
does not exist yet.

**Still forbidden after this:** mainnet, split routes.

### 7. Execute One Non-Mainnet Direct Swap

**Why:** One safe executable path is the product's trust foundation.

Before code, record the first executable DEX path in `docs/DECISIONS.md`.

| Ticket | Change | Proof |
| --- | --- | --- |
| T42 | Define transaction preview model | includes route proof fields below |
| T43 | Add confirmation screen | user reviews proof before signing |
| T44 | Refresh quote before build | stale/expired quote blocked |
| T45 | Compare refresh to preview | material changes blocked |
| T46 | Build unsigned transaction | transaction generated for selected route |
| T47 | Request signature | approve/reject handled |
| T48 | Submit transaction | tx hash returned |
| T49 | Track transaction state | pending/confirmed/failed/expired shown |
| T50 | Add explorer link | network-correct URL |

**Route proof fields:**

- wallet/account context
- network
- input asset ID and amount
- output asset ID
- expected output
- minimum received
- selected DEX
- route hops
- full fee breakdown
- slippage tolerance
- quote source
- quote age
- quote expiration
- executable route ID

**Gate:** One non-mainnet direct swap completes end to end. Stale or changed
routes cannot be signed.

**Still forbidden after this:** mainnet, split routes.

### 8. Add A Second Live DEX

**Why:** Only now does ClearRoute become a real route comparator.

| Ticket | Change | Proof |
| --- | --- | --- |
| T51 | Add second live adapter | two live sources normalize |
| T52 | Show adapter health | stale/failed/available visible |
| T53 | Show rejection reason per route | every row explains status |
| T54 | Add improvement buffer config | tiny wins can be rejected |
| T55 | Gate executability | read-only routes cannot enter signing |

**Gate:** Better gross but worse net loses. Stale, failed, and non-executable
routes cannot win executable flow.

## Mainnet Release Gate

Mainnet remains locked until every item is true:

- [ ] non-mainnet swap completed end to end (code complete, requires real wallet + Blockfrost key)
- [x] route engine tests pass (`src/domain/quoteEngine.test.ts` — 8 tests)
- [x] adapter fixture tests pass (`src/adapters/mockAdapter.test.ts` — 6 tests)
- [ ] browser smoke tests pass (requires Playwright runner)
- [ ] manual wallet checklist passes (requires real wallet session)
- [x] stale quote signing is impossible (`decideRoutes` rejects expired, `comparePreviewToRefreshedRoute` blocks stale refresh)
- [x] route mismatch signing is impossible (`comparePreviewToRefreshedRoute` compares route ID, fee, output, hops)
- [x] wrong-network execution is impossible (`transactionPreview` returns `blocked` for mainnet requests)
- [x] minimum received is enforced in transaction construction (slippage parameter in `buildUnsignedTx`)
- [x] fee breakdown is complete for supported routes (`quoteAdapterSuccess.feeBreakdown` includes DEX, batcher, network, aggregator, deposit)
- [x] asset IDs are visible or inspectable (route rows display asset IDs, `src/domain/assets.ts` lists all known)
- [x] README limitations are current (updated to reflect preprod execution, mainnet locked)
- [ ] security review is complete (not yet performed)

## Explicitly Later

These are out of scope until the comparator is real:

- split-route execution
- multi-hop beyond simple evaluation
- broad token discovery
- limit orders
- portfolio tracking
- historical analytics
- mobile app
- monetization
- backend service without a concrete quote, wallet, transaction, or security need
