/** Apply the read-only resource UI changes to the checked-in Auvra layout. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const changes = new Map();
function load(file) { return changes.get(file) ?? readFileSync(file, "utf8"); }
function replaceExactly(file, previous, next, label) {
  const source = load(file);
  if (source.includes(next)) return;
  const occurrences = source.split(previous).length - 1;
  if (occurrences !== 1) throw new Error(`${label}: expected one original occurrence, found ${occurrences}. No files written.`);
  changes.set(file, source.replace(previous, next));
}

for (const path of [
  "apps/web/src/web3/credit.ts",
  "apps/web/src/web3/credit.test.ts",
  "apps/web/src/pages/ResourcesPage.tsx"
]) {
  if (!existsSync(path)) throw new Error(`Missing patch file: ${path}. Extract the ZIP at repository root.`);
}

const app = "apps/web/src/App.tsx";
replaceExactly(app,
  'import { SettingsPage } from "./pages/SettingsPage";',
  'import { SettingsPage } from "./pages/SettingsPage";\nimport { ResourcesPage } from "./pages/ResourcesPage";',
  "App page import");
replaceExactly(app,
  '<Route path="activity" element={<ActivityPage />} />',
  '<Route path="activity" element={<ActivityPage />} />\n        <Route path="resources" element={<ResourcesPage />} />',
  "App resource route");

const shell = "apps/web/src/components/AppShell.tsx";
replaceExactly(shell,
  'import { Activity, ArrowUpRight, Gauge, Menu, Plus, Settings, X } from "lucide-react";',
  'import { Activity, ArrowUpRight, Gauge, Menu, Plus, Settings, Wallet, X } from "lucide-react";',
  "Sidebar icon import");
replaceExactly(shell,
  '{ to: "/app/activity", label: "Spending & activity", icon: Activity },',
  '{ to: "/app/activity", label: "Spending & activity", icon: Activity },\n  { to: "/app/resources", label: "Resources", icon: Wallet },',
  "Resource navigation link");
replaceExactly(shell,
  '<p className="text-xs font-semibold text-ink">Local workspace</p><p className="mt-0.5 text-[11px] text-muted">Single-user MVP</p>',
  '<p className="text-xs font-semibold text-ink">Protected workspace</p><p className="mt-0.5 text-[11px] text-muted">Phase 2 · Read-only Web3</p>',
  "Workspace status label");
replaceExactly(shell,
  'Local execution workspace</span>',
  'Auvra execution workspace</span>',
  "Workspace header label");

const settings = "apps/web/src/pages/SettingsPage.tsx";
replaceExactly(settings,
  '<section className="card p-5 sm:p-6"><p className="eyebrow">Phase 1 boundary</p><h2 className="mt-2 font-semibold text-ink">Web3-ready, not Web3-active</h2><div className="mt-4 flex gap-2 text-xs leading-5 text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Economic records are structured for future resource providers.</div><div className="mt-3 flex gap-2 text-xs leading-5 text-muted"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> CREDIT monitoring, wallets, signing, transfers, and top-ups are not enabled.</div></section>',
  '<section className="card p-5 sm:p-6"><p className="eyebrow">Phase 2 · Read-only Web3</p><h2 className="mt-2 font-semibold text-ink">Wallet-connected resource visibility</h2><div className="mt-4 flex gap-2 text-xs leading-5 text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Browser wallet connection, Robinhood Chain selection, and live wallet CREDIT/ETH balance reads are available under Resources.</div><div className="mt-3 flex gap-2 text-xs leading-5 text-muted"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> Activated inference balance, signing, transfers, activation, purchases, and automatic top-ups are not enabled. Inference costs remain separate from wallet balances.</div><a href="/app/resources" className="button-secondary mt-5">Open Resources</a></section>',
  "Phase 2 Settings boundary");
replaceExactly(settings,
  '<strong className="text-ink">Local-only security notice:</strong> the workspace has no production authentication or tenant isolation. Do not expose it publicly until access controls and deployment hardening are in place.',
  '<strong className="text-ink">Security notice:</strong> the Railway demo uses a shared password, not individual user accounts. Wallet reads happen in the visitor\'s browser and are not bound to an Auvra account. Do not enable multi-user funding or wallet-linked transactions without account isolation and a security review.',
  "Accurate demo security notice");

const landing = "apps/web/src/pages/LandingPage.tsx";
replaceExactly(landing,
  '<MiniFact title="Future" copy="CREDIT and authorized resource management" />',
  '<MiniFact title="Phase 2" copy="Read-only wallet and CREDIT visibility" />',
  "Landing Phase 2 fact");
replaceExactly(landing,
  'Wallet signing, automatic top-ups, token transfers and autonomous on-chain transactions are not enabled in Phase 1.',
  'Phase 2 supports read-only wallet connection and on-chain CREDIT balances. Activation, transfers, signing and autonomous top-ups are not enabled.',
  "Landing accurate capability notice");
replaceExactly(landing,
  'Web3 resource management is in development.',
  'Read-only CREDIT monitoring is available in the workspace.',
  "Landing footer capability");
replaceExactly(landing,
  'Powered by Orbio · Phase 1 MVP',
  'Powered by Orbio · Phase 2 read-only',
  "Landing footer phase label");

for (const [path, content] of changes) writeFileSync(path, content, "utf8");
console.log(`Auvra Phase 2 Release 1 applied: ${changes.size} existing files updated.`);
console.log("New resource page and Web3 tests are ready. No credentials or mission data touched.");
