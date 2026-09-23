/** Apply Auvra Release 2a to the existing Release 1 checkout. No credentials touched. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const required = [
  "apps/web/src/web3/credit.ts",
  "apps/web/src/web3/transactions.ts",
  "apps/web/src/web3/transactions.test.ts",
  "apps/web/src/components/CreditTransferPanel.tsx",
  "apps/web/src/pages/ResourcesPage.tsx",
  "apps/web/src/pages/SettingsPage.tsx",
  "apps/web/src/pages/LandingPage.tsx",
  "apps/web/src/components/AppShell.tsx"
];
for (const path of required) if (!existsSync(path)) {
  throw new Error(`Missing ${path}. Extract Release 2a at the Auvra repository root, after installing Release 1.`);
}
const updated = new Map();
function load(path) { return updated.get(path) ?? readFileSync(path, "utf8"); }
function replace(path, before, after, label) {
  const original = load(path);
  if (original.includes(after)) return;
  const count = original.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one exact existing pattern, found ${count}. No existing files written.`);
  updated.set(path, original.replace(before, after));
}

const resources = "apps/web/src/pages/ResourcesPage.tsx";
replace(resources,
  'import { PageHeader } from "../components/ui";',
  'import { PageHeader } from "../components/ui";\nimport { CreditTransferPanel } from "../components/CreditTransferPanel";',
  "Transfer panel import");
replace(resources,
  'description="Connect an EVM wallet to inspect your Orbio CREDIT holdings on Robinhood Chain. All blockchain access in this release is read-only."',
  'description="View your Orbio CREDIT holdings on Robinhood Chain and prepare transfers requiring explicit approval in your own wallet."',
  "Resource heading");
replace(resources,
  'detail="Native ETH balance on Robinhood Chain; no transfers are enabled"',
  'detail="Native ETH balance on Robinhood Chain; network fees apply to signed transfers"',
  "ETH description");
replace(resources,
  '    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">',
  '    <div className="mb-6"><CreditTransferPanel provider={wallet} account={connected && correctNetwork ? account : null} snapshot={connected && correctNetwork ? snapshot : null} onBalanceRefresh={refresh} /></div>\n\n    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">',
  "Transfer panel placement");
replace(resources,
  '<h2 className="font-semibold text-ink">Read-only by design</h2>',
  '<h2 className="font-semibold text-ink">Spending requires your approval</h2>',
  "Safety heading");
replace(resources,
  'This release can request account access, switch networks and read token balances. It cannot sign, transfer, activate, purchase or top up CREDIT. Wallet connection is separate from mission approval.',
  'Wallet reads and CREDIT transfers run in your browser. Each transfer requires a fresh review and an explicit signature in your wallet. Auvra never stores your private key, performs background transfers, or treats a transfer as an activation. Wallet connection is separate from mission approval.',
  "Safety description");
replace(resources,
  'CREDIT activation and funding require verified contract methods, user-approved transactions and authoritative activation receipts. They are not enabled in this release.',
  'Activation and funding still require verification of Orbio-specific contract interfaces and authoritative activated-balance receipts. They are not enabled in this release. CREDIT transfers are not equivalent to activation.',
  "Activation note");

const settings = "apps/web/src/pages/SettingsPage.tsx";
replace(settings, 'Phase 2 · Read-only Web3', 'Phase 2 · User-approved transfers', "Settings eyebrow");
replace(settings, 'Wallet-connected resource visibility', 'Wallet-connected resources and transfers', "Settings heading");
replace(settings,
  'Browser wallet connection, Robinhood Chain selection, and live wallet CREDIT/ETH balance reads are available under Resources.',
  'Browser wallet connection, live CREDIT/ETH balance reads and explicit user-approved CREDIT transfers are available under Resources.',
  "Settings enabled features");
replace(settings,
  'Activated inference balance, signing, transfers, activation, purchases, and automatic top-ups are not enabled. Inference costs remain separate from wallet balances.',
  'Wallet signing is permitted only for an individually reviewed CREDIT transfer. Activated inference balance, activation, purchases and automatic top-ups remain disabled. Inference costs are separate from wallet balances.',
  "Settings planned features");
replace(settings,
  'Do not enable multi-user funding or wallet-linked transactions without account isolation and a security review.',
  'Browser wallet transfers require an explicit signature by the wallet owner. Browser-local transaction history is not shared across users or devices. Do not enable shared server-side wallet funding or unattended transactions without account isolation and a security review.',
  "Settings security note");

const shell = "apps/web/src/components/AppShell.tsx";
replace(shell, 'Phase 2 · Read-only Web3', 'Phase 2 · Controlled Web3', "Sidebar status");

const landing = "apps/web/src/pages/LandingPage.tsx";
replace(landing, 'copy="Read-only wallet and CREDIT visibility"', 'copy="Wallet visibility and user-approved CREDIT transfers"', "Landing fact");
replace(landing,
  'Phase 2 supports read-only wallet connection and on-chain CREDIT balances. Activation, transfers, signing and autonomous top-ups are not enabled.',
  'Phase 2 supports on-chain CREDIT balances and user-approved transfers. Activation, purchases and autonomous top-ups are not enabled.',
  "Landing capability statement");
replace(landing, 'Read-only CREDIT monitoring is available in the workspace.', 'CREDIT monitoring and user-approved transfers are available in the workspace.', "Landing footer");
replace(landing, 'Powered by Orbio · Phase 2 read-only', 'Powered by Orbio · Phase 2', "Landing phase label");

for (const [path, contents] of updated) writeFileSync(path, contents, "utf8");
console.log(`SUCCESS: Auvra Phase 2 Release 2a installed. ${updated.size} existing files updated.`);
console.log("No API keys, private keys, data volume, mission budgets or backend authentication changed.");
console.log("CREDIT activation, purchase and automatic top-ups remain disabled pending verified Orbio interfaces.");
