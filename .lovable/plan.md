## Goal

Polish the Crypto Sandbox panel inside `CryptoDepositPanel` so it behaves like the fiat Add Funds flow, and route simulated deposits into the wallet's main Transaction History (image 2) instead of the inline "Recent Top-Ups" list (image 1).

## Changes

### 1. `src/components/wallet/CryptoSandboxPanel.tsx`

- Change initial input state from `useState('50')` to `useState('')` so the field is empty on open.
- Quick-amount chips (`+ $10 / $50 / $100 / $500`) no longer call `simulateDeposit` directly. Instead they set the input value (additive — clicking `+ $50` twice fills `100`), so the typed amount and the chips both feed the same total.
- Rename the primary action button label from `Simulate` to `Deposit`. It still calls `simulateDeposit(Number(amount))`, then clears the input on success. Keep the Sparkles icon (or swap for `ArrowDownLeft` to match deposit semantics — open question, default: keep Sparkles).
- Remove the entire "Recent Top-Ups" block (the `{grants.length > 0 && ...}` section and the unused list rendering).
- Keep: balance display, lock state, eligibility gating, helper copy.

### 2. `src/components/Wallet/TransactionHistory.tsx`

Merge self-simulated sandbox grants into the user's transaction feed so they appear exactly like a fiat deposit row (image 2 style):

- In `fetchTransactions`, in addition to the existing `transactions` query, fetch `crypto_sandbox_grants` for the current user where `kind = 'self_simulated'`, ordered by `created_at desc`, limit 20.
- Map each grant into the `Transaction` shape:
  - `transaction_type: 'deposit'`
  - `amount_usd: grant.amount_usd`
  - `amount_jvc: grant.amount_usd` (1:1 JVC peg, matches existing convention)
  - `fee_amount: 0`
  - `status: 'completed'`
  - `description: 'Simulated crypto deposit (test funds)'`
  - `to_wallet_type: 'user'`, `from_wallet_type: null`
  - `id: \`sandbox-${grant.id}\``
- Concatenate with real transactions, sort by `created_at desc`, slice to 20, then `setTransactions`.
- Only do this for the user view (skip when `venueId` is passed).

No schema changes. No backend changes. The existing `simulate_crypto_sandbox_deposit` RPC already writes to `crypto_sandbox_grants`, which is what we read.

### Files touched

- `src/components/wallet/CryptoSandboxPanel.tsx` (edit)
- `src/components/Wallet/TransactionHistory.tsx` (edit)

### Preserved

- `useCryptoSandbox` hook, RPC functions, eligibility logic, lock-on-real-deposit behavior, fiat flow, `useVenueWallet`, all other components.
