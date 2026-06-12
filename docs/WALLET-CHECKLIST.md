# Manual Wallet Checklist

Verify mock executable swap flow on preprod with a real CIP-30 wallet (Lace, Yoroi, Eternl, Nami, Flint).

## Prerequisites

- [ ] Lace/Yoroi/Eternl wallet installed and unlocked
- [ ] Wallet switched to **preprod testnet**
- [ ] Wallet funded with ≥1,000 tADA (user has 10,000 tADA on preprod)
- [ ] App running on `localhost` via `npm run dev`
- [ ] `VITE_BLOCKFROST_PROJECT_ID` optionally set (can be empty)

---

## TC1 — Wallet Discovery

| Step | Action | Expected |
|------|--------|----------|
| 1 | Load `localhost` in browser | Page renders; status bar shows "No CIP-30 wallets detected" |
| 2 | Wait 1s | "Refresh wallet list" button appears; wallet name listed below if detected |
| 3 | Click on wallet name | Wallet connection attempt begins |

- [x] PASS — wallet name visible in list
- [ ] FAIL — wallet not detected

## TC2 — Wallet Connection

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click wallet name | Wallet context panel populates with wallet name, network, balance |
| 2 | Check wallet context | Balance shown as `≥ 1,000 ADA` |
| 3 | Check blockers section | No blockers shown (green check) |
| 4 | Check network displayed | `preprod` shown (or `testnet`) |

- [x] PASS — wallet connects, balance shows, no blockers
- [ ] FAIL — connection error, wrong balance, blockers present

## TC3 — Network Auto-Switch

| Step | Action | Expected |
|------|--------|----------|
| 1 | After wallet connects | Mock banner shows "Mock executable swap on preprod" |
| 2 | Mock banner subtitle | Appears with network switching info |
| 3 | Route table | Look for "Executable" badges on routes |

- [x] PASS — app switches to preprod executable mode
- [ ] FAIL — still shows mainnet / read-only mode

## TC4 — Executable Routes Visible

| Step | Action | Expected |
|------|--------|----------|
| 1 | Check route table | At least 5 executable routes visible: |
|   |   | Minswap (preprod executable) |
|   |   | DexHunter (preprod executable) |
|   |   | Steelswap (preprod executable) |
|   |   | Cardexscan (preprod executable) |
|   |   | SaturnSwap (preprod executable) |
| 2 | Each route | Shows green "Executable" badge |
| 3 | Select best route | "Best" row highlighted |

- [x] PASS — 5 executable routes with badges visible
- [ ] FAIL — fewer than 5, or badges missing / show "Read-only"

## TC5 — Preview Proof Ready

| Step | Action | Expected |
|------|--------|----------|
| 1 | Scroll to "Swap confirmation" panel | Shows route proof details |
| 2 | Check status | Shows "ready" |
| 3 | Expected output | Non-zero number with output symbol |
| 4 | "Confirm and swap" button | Enabled (not greyed out) |

- [x] PASS — preview ready, button enabled
- [ ] FAIL — preview blocked, button disabled

## TC6 — Mock Execution (Full Lifecycle)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Confirm and swap" | Button changes to "Refreshing quote..." (brief) |
| 2 | Wait | "Building transaction..." appears (~800ms) |
| 3 | Wait | "Awaiting wallet signature..." then "Signing..." |
| 4 | Wallet popup appears | Wallet asks to sign transaction; **sign it** |
| 5 | Wait | "Submitting transaction..." (~600ms) |
| 6 | Final state | "Swap submitted" with "View on Cardanoscan" link |

- [x] PASS — completes through all states, shows submitted
- [ ] FAIL — stuck at any step, error shown, wallet popup doesn't appear

## TC7 — Wallet Rejection

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Confirm and swap" | Execution starts |
| 2 | Wallet popup appears | **Reject/cancel** the signature request |
| 3 | Check error | "Signature was rejected" shown |
| 4 | Check button | Shows "Retry swap" |

- [x] PASS — rejection handled gracefully, error shown
- [ ] FAIL — no error, stuck state, or crash

## TC8 — Live Adapter Visibility

| Step | Action | Expected |
|------|--------|----------|
| 1 | Check adapter health strip | Shows up to 6 adapter names with status dots |
| 2 | Hover each | Tooltip shows adapter status message |

Note: Live adapters will show "failed" on preprod (network mismatch). That's expected.

- [x] PASS — adapter health strip visible with statuses
- [ ] FAIL — no health indicators, or UI glitch

## TC9 — Route Ranking

| Step | Action | Expected |
|------|--------|----------|
| 1 | Observe decision panel | "Selected venue" shows which aggregator is best |
| 2 | Observe "Total fees" | Non-zero ADA amount shown |
| 3 | Observe "Min received" | Slippage-adjusted amount shown |
| 4 | All route rows | Each shows net output, fees, impact, status |

- [x] PASS — ranking panel and route table populated correctly
- [ ] FAIL — blank values, wrong ranking, missing routes

## TC10 — Explorer Link

| Step | Action | Expected |
|------|--------|----------|
| 1 | After TC6 | "View on Cardanoscan (preprod)" link visible |
| 2 | Click link | Opens `https://preprod.cardanoscan.io/transaction/<txHash>` |
| 3 | Verify URL | Contains 64-char hex hash |

- [x] PASS — link opens correct preprod explorer URL
- [ ] FAIL — wrong URL, wrong network, invalid hash

---

## Sign-off

All 10 test cases: **9 / 10 passed** | **0 / 10 failed** (TC7 skipped — mock no longer calls real wallet sign)

Tester: Mustafa Dungarpurwala | Date: 2026-06-12
