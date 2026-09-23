# Auvra Phase 2 — Release 2a: Controlled CREDIT transfers

This release layers real wallet-initiated CREDIT transfers over the existing read-only Release 1 resource page. It is **not** a custodial wallet, activation flow, automatic top-up, exchange, or new inference-balance source.

## What works

- Reads fresh on-chain CREDIT and ETH balances and verifies Robinhood Chain (4663) before preparing a transfer.
- Validates amount as an exact integer with 6 CREDIT decimals and checks the recipient, available tokens, estimated gas, ETH buffer, and contract address.
- Displays a review requiring an explicit checkbox and a separate browser-wallet signature request.
- Sends a standard ERC-20 `transfer(address,uint256)` to the official CREDIT contract.
- Saves the returned transaction hash only in the current browser, scoped to the sending account and chain. The server does not receive wallet keys, signatures or history.
- Checks an on-chain receipt, its sender/contract and its standard ERC-20 Transfer event before labeling success.
- Never automatically retries an uncertain transaction. A submit error should be checked in the wallet and explorer before trying again.

## Deliberately disabled

- CREDIT activation/burning to off-chain Orbio inference balance. The exact `activate` interface and authoritative account-balance attribution require independent verification. A normal transfer is **not** activation.
- `buyAndActivate`, USDG allowances, token swaps, automated purchases or funding policies.
- Server-side signing, delegated wallet credentials, private keys or automatic purchases.
- Shared backend transaction ledger: the shared demo password does not implement true individual account isolation. Browser-local receipts are intentionally scoped to wallet address and device.

## Installation

1. Check `git status --short` and back up your project.
2. Extract the archive at the Auvra project root.
3. Run `node scripts/apply-auvra-phase2-release2a.mjs`.
4. Run `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`.
5. Preview locally and validate transfer preparation with your connected wallet, **without confirming a live transaction** unless you intend to spend real CREDIT and ETH.
6. Commit and push only after verification. In Railway, explicitly deploy the latest commit and verify its hash.

The preparation preview makes read-only RPC calls; the final **Confirm in wallet** button may broadcast a real, potentially irreversible transaction. There is no default destination or prefilled amount. Auvra never sends automatically. Check the target wallet and gas estimate each time. The user-signed transaction remains subject to wallet/network behavior and should not be described as guaranteed non-lossy.

### Data and security

Transaction metadata is stored in `localStorage` under a chain/account-specific key. It is not an authoritative global activity ledger, nor synced to Railway persistent storage. Clearing browser data clears local history, not the on-chain transaction. Use the explorer to verify.

Official reference: https://www.orbio.so/protocol and https://docs.robinhood.com/chain/connecting/ .
