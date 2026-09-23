# Auvra Phase 2 — Release 1: Read-only resource visibility

This patch adds a functional **Resources** workspace page to the existing Auvra React application. It uses the browser's EIP-1193 provider, which keeps accounts and blockchain operations in the visitor's wallet. No new npm dependencies and no changes to the backend are needed.

## Current capabilities

- Detect injected EVM wallets, including MetaMask and Rabby when exposed by the browser.
- Request account connection only after an explicit Connect click.
- Inspect the current chain and prompt to switch/add Robinhood Chain mainnet (4663).
- Query the official Orbio CREDIT contract's bytecode, `decimals()` and `balanceOf(account)` using the connected wallet provider. Read ETH for network fees and the last block number.
- Display last refresh time and open wallet/contract explorer links.
- Display wallet-held CREDIT separately from activated Orbio API credit and provider-reported mission spending.
- Show errors for wrong chain, rejected connection, unavailable contract and failed RPC reads. Handle account and chain changes.

## Explicitly NOT implemented

Activation, swapping/purchasing, transfers, signatures, auto top-ups, automatic resource allocation and Orbio account balance API integration. This release is read-only: no `eth_sendTransaction`, signing, or backend wallet/private-key storage. "Hide wallet" only hides it inside Auvra; revoke access using the wallet extension's connected-sites settings.

## Verified network and token references

- Orbio CREDIT: https://www.orbio.so/protocol
- CREDIT contract: `0xe33322da1380e61e5ae5dfb21e7f62924c73004c`
- Robinhood Chain ID: `4663` (`0x1237`)
- Public RPC: `https://rpc.mainnet.chain.robinhood.com`
- Explorer: https://robinhoodchain.blockscout.com
- Network setup: https://docs.robinhood.com/chain/connecting/

Do not substitute ticker-matched tokens. The contract address is taken from Orbio's own protocol page. Its deployed bytecode and decimals are checked by the application during live reads. The public RPC is rate-limited; wallet-provided RPC performance varies.

## Apply

From Git Bash in `~/projects/Auvra` after extracting the ZIP at the repo root:

```bash
node scripts/apply-auvra-phase2.mjs
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Check `git diff` and `git status`. Stage the seven changed/new application files, the installer script and this documentation only after tests pass. Never commit `.env` or private keys. Railway will deploy from GitHub once the intended commit is selected.

## Demo safety

The production Auvra demo uses a shared password, **not** multi-user accounts. Wallet connection does not imply a relationship between a wallet and a distinct Auvra user. Do not implement persistent wallet ownership, signing or funding without individual authentication and consent/authorization design. Wallet CREDIT is **not** the same as activated inference balance or a mission's USD provider-reported cost.
