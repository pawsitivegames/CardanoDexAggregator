# Architecture

ClearRoute is organized around a narrow trust boundary: the UI may present route
decisions, but route identity, ranking, quote normalization, wallet state, and
transaction readiness must live outside React components.

## Layers

### UI

The UI renders quote mode, request fields, selected routes, rejected routes,
warnings, fees, freshness, source, and executability. It must not own route
ranking, DEX-specific normalization, wallet policy, or transaction construction.
Until live integrations exist, the first viewport must make mock mode visible.

### Domain

The domain layer owns asset identity, request validation, fee representation,
candidate route types, rejection reasons, ranking, freshness checks, and decision
output. Internally, assets are identified by Cardano asset IDs; symbols and names
are display metadata only. Route decisions must include enough evidence for the
UI and later transaction preview checks to explain why a candidate won or lost.

### Adapters

Adapters convert external or mock quote sources into normalized domain
candidates. Mock, fixture, and live quotes must flow through the same adapter
contract. Adapter output must include source identity, quote mode, network, asset
IDs, gross output, fee breakdown, hops, timestamps, expiration or max-age policy,
executability, and structured failures.

### Wallet

Wallet code is responsible for CIP-30 discovery, connection state, network ID,
balances, address retrieval (`getUsedAddresses`, `getChangeAddress`,
`getRewardAddresses`), and normalized wallet errors. Wallet state can make a
route actionable or blocked, but wallet code must not rank routes. The wallet
layer also exposes `signTx()` for signing unsigned transactions and `submitTx()`
for submitting signed transactions via the wallet provider.

### Transactions

Transaction code owns unsigned transaction construction (via the Minswap
Aggregator `/build-tx` API), preview proof fields, quote refresh before build,
preview-vs-refresh comparison, CIP-30 signing, submission (via
`/finalize-and-submit-tx`), and tracking (via Blockfrost polling). A state
machine (`txTracker.ts`) transitions through `building → awaiting_signature →
submitted → pending → confirmed/failed/expired`. Mainnet transaction support
remains locked.

## Cross-Layer Rules

- UI copy must distinguish mock, fixture, and live quote modes.
- Read-only routes cannot enter a signing flow.
- Stale, malformed, unsupported, or failed quotes fail closed.
- Fees must be visible as structured costs, not hidden inside a single output
  number.
- Mainnet remains disabled until the project has live read-only quote proof,
  wallet gating, non-mainnet execution proof, and security review.
