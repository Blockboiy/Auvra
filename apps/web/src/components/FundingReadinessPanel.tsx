import { useEffect, useRef, useState } from "react";
import { ChevronDown, AlertCircle, ArrowUpRight, CheckCircle2, Coins, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { formatUnits, walletErrorMessage, type CreditSnapshot, type Eip1193Provider } from "../web3/credit";
import {
  FUNDING_DISABLED_REASON, FUNDING_EXECUTION_ENABLED, ORBIO_EXCHANGE_ADDRESS,
  ORBIO_USDG_ADDRESS, prepareFundingPlan, readFundingSnapshot,
  type FundingPlan, type FundingSnapshot
} from "../web3/funding";
import { ROBINHOOD_EXPLORER } from "../web3/credit";

interface Props { provider: Eip1193Provider | undefined; account: string | null; snapshot: CreditSnapshot | null }
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const USDG_EXPLORER = `${ROBINHOOD_EXPLORER}/address/${ORBIO_USDG_ADDRESS}`;
const EXCHANGE_EXPLORER = `${ROBINHOOD_EXPLORER}/address/${ORBIO_EXCHANGE_ADDRESS}`;

export function FundingReadinessPanel({ provider, account, snapshot }: Props) {
  const [funding, setFunding] = useState<FundingSnapshot | null>(null);
  const [target, setTarget] = useState("");
  const [plan, setPlan] = useState<FundingPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    sequence.current++;
    setFunding(null); setPlan(null); setError(null); setBusy(false);
  }, [account, provider, snapshot?.chainId]);
  async function refresh() {
    if (!provider || !account || !snapshot || busy) return;
    const id = ++sequence.current;
    setBusy(true); setError(null); setFunding(null); setPlan(null);
    try {
      const latest = await readFundingSnapshot(provider, account);
      if (sequence.current === id) setFunding(latest);
    } catch (cause) {
      if (sequence.current === id) setError(walletErrorMessage(cause));
    } finally {
      if (sequence.current === id) setBusy(false);
    }
  }
  function calculate() {
    if (!funding || !snapshot) return;
    setError(null); setPlan(null);
    try { setPlan(prepareFundingPlan(target, snapshot, funding)); }
    catch (cause) { setError(walletErrorMessage(cause)); }
  }
  const ready = Boolean(provider && account && snapshot && snapshot.account.toLowerCase() === account.toLowerCase());
  return <details className="group card overflow-hidden" aria-labelledby="funding-heading">
    <summary className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-5 sm:px-6 cursor-pointer list-none transition-colors hover:bg-violet/[.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-violet [&::-webkit-details-marker]:hidden">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-violet/[.07] p-2.5 text-violet"><Coins className="h-5 w-5" /></span><div><h2 id="funding-heading" className="font-semibold text-ink">Fund intelligence · readiness</h2><p className="mt-1 text-xs text-muted">Live USDG and exchange checks before future CREDIT activation.</p></div></div>
      <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800">No purchase or activation enabled</span>
      <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-violet transition-transform duration-200 group-open:rotate-180" />
    </summary>
    <div className="space-y-5 p-5 sm:p-6">
      <div className="rounded-xl border border-violet/10 bg-violet/[.04] px-4 py-3 text-xs leading-6 text-ink">Orbio documents CREDIT activation and exchange funding. This screen verifies wallet resources and estimates your CREDIT shortfall; it does <strong>not</strong> quote a market price or add balance to your Orbio API key.</div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-semibold text-muted">Available wallet USDG</p><p className="mt-1 text-2xl font-bold tracking-tight text-ink">{funding ? formatUnits(funding.usdgRaw, 6) : "—"} <span className="text-sm font-semibold">USDG</span></p></div>
        <button type="button" className="button-secondary" disabled={!ready || busy} onClick={() => void refresh()}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check funding</button>
      </div>
      {!ready && <p className="text-xs text-muted">Connect and refresh a wallet on Robinhood Chain to check USDG.</p>}
      {funding && <div className="grid gap-3 text-xs sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3"><p className="text-muted">USDG contract</p><a href={USDG_EXPLORER} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-violet">{short(ORBIO_USDG_ADDRESS)} <ArrowUpRight className="h-3.5 w-3.5" /></a></div>
        <div className="rounded-xl border border-line p-3"><p className="text-muted">Orbio exchange</p><p className={`mt-1 flex items-center gap-1 font-semibold ${funding.exchangeDeployed ? "text-emerald-700" : "text-amber-800"}`}>{funding.exchangeDeployed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}{funding.exchangeDeployed ? "Contract deployed" : "Contract unavailable"}</p><a href={EXCHANGE_EXPLORER} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-violet">View contract <ArrowUpRight className="h-3.5 w-3.5" /></a></div>
        <p className="sm:col-span-2 text-muted">RPC block {funding.blockNumber.toString()} · {new Date(funding.observedAt).toLocaleString()} · Contract presence does not establish liquidity, a price or a valid purchase route.</p>
      </div>}
      <div className="border-t border-line pt-5"><label className="block text-xs font-semibold text-ink">Target wallet CREDIT
        <input className="field mt-2 w-full" inputMode="decimal" autoComplete="off" value={target} placeholder="e.g. 100" disabled={!funding || busy} onChange={(event) => { setTarget(event.target.value); setPlan(null); }} />
      </label><p className="mt-2 text-xs text-muted">Current wallet CREDIT: {snapshot ? formatUnits(snapshot.creditRaw, snapshot.creditDecimals) : "—"}. This is separate from activated inference balance.</p>
      <button type="button" className="button-secondary mt-4" disabled={!funding || !snapshot || !target.trim() || busy} onClick={calculate}><ShieldCheck className="h-4 w-4" /> Calculate shortfall</button>
      </div>
      {plan && <div className="rounded-xl border border-violet/15 bg-violet/[.04] p-4"><p className="text-sm font-semibold text-ink">Resource target</p><dl className="mt-3 divide-y divide-violet/10 text-xs"><div className="flex justify-between gap-3 py-2"><dt className="text-muted">Desired wallet CREDIT</dt><dd className="font-semibold text-ink">{formatUnits(plan.targetCreditRaw, 6)}</dd></div><div className="flex justify-between gap-3 py-2"><dt className="text-muted">Additional CREDIT needed</dt><dd className="font-semibold text-ink">{formatUnits(plan.shortfallRaw, 6)}</dd></div><div className="flex justify-between gap-3 py-2"><dt className="text-muted">Face-value reference only</dt><dd className="font-semibold text-ink">{formatUnits(plan.faceValueUsdgRaw, 6)} USDG</dd></div></dl><p className="mt-2 text-[11px] leading-5 text-muted">This is not a purchase quote. The order book may have different prices, insufficient liquidity, fees, slippage and gas costs. Wallet CREDIT is not activated API credit.</p></div>}
      {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
      {!FUNDING_EXECUTION_ENABLED && <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs leading-6 text-amber-900"><p className="font-semibold">Activation and purchase are gated</p><p className="mt-1">{FUNDING_DISABLED_REASON}</p></div>}
      <a href="https://www.orbio.so/protocol" target="_blank" rel="noopener noreferrer" className="button-secondary inline-flex"><ExternalLink className="h-4 w-4" /> Open Orbio CREDIT protocol</a>
      <p className="text-[11px] leading-5 text-muted">You will not be asked to approve tokens, sign messages, or send any transaction in this panel. Transfer controls are separate below.</p>
    </div>
  </details>;
}
