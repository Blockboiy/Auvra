import { useCallback, useEffect, useRef, useState } from "react";
import type { Mission, ProviderStatus } from "@auvra/shared";
import { ChevronDown, ArrowRight, CheckCircle2, CircleDollarSign, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { money } from "./ui";
import { formatUnits, walletErrorMessage, type CreditSnapshot, type Eip1193Provider } from "../web3/credit";
import { readActivationQuote, type ActivationQuote } from "../web3/activationQuote";
import { ORBIO_EXCHANGE_ADDRESS } from "../web3/funding";

interface Props { provider: Eip1193Provider | undefined; account: string | null; snapshot: CreditSnapshot | null }

export function HybridResourcesPanel({ provider, account, snapshot }: Props) {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [gatewayBusy, setGatewayBusy] = useState(false);
  const [usdgInput, setUsdgInput] = useState("");
  const [maxFills, setMaxFills] = useState("8");
  const [quote, setQuote] = useState<ActivationQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const requestId = useRef(0);

  const refreshGateway = useCallback(async () => {
    setGatewayBusy(true); setGatewayError(null);
    try {
      const [nextStatus, nextMissions] = await Promise.all([api.providerStatus(), api.missions()]);
      setStatus(nextStatus);
      setMissions(nextMissions);
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : "Unable to read the Orbio resource ledger.");
    } finally { setGatewayBusy(false); }
  }, []);

  useEffect(() => { void refreshGateway(); }, [refreshGateway]);
  useEffect(() => { requestId.current++; setQuote(null); setQuoteError(null); setQuoteBusy(false); }, [account, provider, snapshot?.chainId]);

  async function requestQuote() {
    if (!provider || !account || !snapshot || quoteBusy) return;
    const id = ++requestId.current;
    setQuoteBusy(true); setQuote(null); setQuoteError(null);
    try {
      const next = await readActivationQuote(provider, account, usdgInput, Number(maxFills));
      if (requestId.current === id) setQuote(next);
    } catch (error) {
      if (requestId.current === id) setQuoteError(walletErrorMessage(error));
    } finally { if (requestId.current === id) setQuoteBusy(false); }
  }

  const ready = Boolean(provider && account && snapshot && snapshot.account.toLowerCase() === account.toLowerCase());
  const actualSpend = missions?.reduce((sum, mission) => sum + mission.actualCostUsd, 0) ?? 0;
  const tokens = missions?.reduce((sum, mission) => sum + mission.usage.total, 0) ?? 0;
  const completedCalls = missions?.flatMap(m => m.events).filter(e => e.type === "inference.completed" && e.cost?.kind === "actual" && e.cost.source === "provider").length ?? 0;
  const recent = missions?.filter(m => m.events.some(e => e.type === "inference.completed"))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3) ?? [];

  return <details className="group card overflow-hidden" aria-labelledby="hybrid-resources-title">
    <summary className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-5 sm:px-6 cursor-pointer list-none transition-colors hover:bg-violet/[.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-violet [&::-webkit-details-marker]:hidden">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-violet/[.07] p-2.5 text-violet"><Zap className="h-5 w-5" /></span><div>
        <h2 id="hybrid-resources-title" className="font-semibold text-ink">Intelligence resources · live MVP</h2>
        <p className="mt-1 text-xs leading-5 text-muted">Read-only exchange pricing alongside actual Orbio gateway usage. No synthetic balance.</p>
      </div></div>
      <span className="rounded-full bg-violet/[.08] px-3 py-1 text-[11px] font-semibold text-violet">Hybrid resource mode</span>
      <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-violet transition-transform duration-200 group-open:rotate-180" />
    </summary>
    <div className="space-y-6 p-5 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">Orbio gateway</p><p className="mt-2 text-lg font-bold capitalize text-ink">{status?.overall?.replace("_", " ") ?? "Not checked"}</p><p className="mt-1 text-[11px] leading-5 text-muted">{status?.checks.inference.message ?? "Uses existing server-side API credential."}</p></div>
        <div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">Recorded actual inference spend</p><p className="mt-2 text-lg font-bold text-ink">{missions ? money(actualSpend) : "—"}</p><p className="mt-1 text-[11px] leading-5 text-muted">Past missions only. This is not available API balance.</p></div>
        <div className="rounded-xl border border-line p-4"><p className="text-xs text-muted">Provider-reported completed calls</p><p className="mt-2 text-lg font-bold text-ink">{missions ? completedCalls.toLocaleString() : "—"}</p><p className="mt-1 text-[11px] leading-5 text-muted">{missions ? `${tokens.toLocaleString()} tokens across recorded missions` : "Awaiting ledger"}</p></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-muted">{status ? `Configured model: ${status.model}. Last checked: ${status.checkedAt ? new Date(status.checkedAt).toLocaleString() : "—"}.` : "Gateway status is read directly from Auvra's protected backend."}</p>
        <button type="button" className="button-secondary" disabled={gatewayBusy} onClick={() => void refreshGateway()}>{gatewayBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh gateway</button>
      </div>
      {gatewayError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{gatewayError}</p>}
      <div className="rounded-xl border border-violet/15 bg-violet/[.04] p-4 text-xs leading-6 text-ink">
        <ShieldCheck className="mb-2 h-5 w-5 text-violet" /><p className="font-semibold">Two real resource layers; no claimed wallet-to-key conversion.</p>
        <p className="mt-1">Your on-chain CREDIT and USDG belong to the connected wallet. Orbio gateway calls use the server-side API key and their actual costs are recorded per mission. Activated balance and beneficiary attribution have not been verified.</p>
      </div>
      <div className="border-t border-line pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">Live exchange activation quote</h3><p className="mt-1 text-xs leading-5 text-muted">Read the verified Exchange implementation’s getActivationQuote view through its proxy; no approval or transaction.</p></div><a className="inline-flex items-center gap-1 text-xs font-semibold text-violet hover:underline" href={`https://robinhoodchain.blockscout.com/address/${ORBIO_EXCHANGE_ADDRESS}`} rel="noopener noreferrer" target="_blank">Exchange contract <ExternalLink className="h-3.5 w-3.5" /></a></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
          <label className="block text-xs font-semibold text-ink">USDG input <input className="field mt-2 w-full" inputMode="decimal" autoComplete="off" value={usdgInput} onChange={e => { requestId.current++; setUsdgInput(e.target.value); setQuote(null); setQuoteBusy(false); }} placeholder="e.g. 1.00" disabled={!ready} /></label>
          <label className="block text-xs font-semibold text-ink">Maximum fills <input className="field mt-2 w-full" type="number" min="1" max="256" step="1" value={maxFills} onChange={e => { requestId.current++; setMaxFills(e.target.value); setQuote(null); setQuoteBusy(false); }} disabled={!ready} /></label>
          <button type="button" className="button-secondary" disabled={!ready || quoteBusy || !usdgInput.trim()} onClick={() => void requestQuote()}>{quoteBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CircleDollarSign className="h-4 w-4" />} Get live quote</button>
        </div>
        {!ready && <p className="mt-3 text-xs text-muted">Connect and refresh the wallet on Robinhood Chain before reading the quote.</p>}
        {quoteError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{quoteError}</p>}
        {quote && <div className="mt-4 rounded-xl border border-violet/15 bg-violet/[.04] p-4"><p className="mb-2 text-sm font-semibold text-ink">Contract-returned quote</p><dl className="divide-y divide-violet/10 text-xs">
          {([
            ["USDG input", `${formatUnits(quote.usdgInput, 6)} USDG`],
            ["USDG spent by quote", `${formatUnits(quote.usdgSpent, 6)} USDG`],
            ["Gross CREDIT output", `${formatUnits(quote.creditOut, 6)} CREDIT`],
            ["Credited amount (contract estimate)", `${formatUnits(quote.creditedAtoms, 6)} CREDIT`],
            ["Order-book fee", `${formatUnits(quote.orderbookFeeAtoms, 6)} atoms (contract value)`],
            ["Activation fee", `${formatUnits(quote.activationFeeAtoms, 6)} atoms (contract value)`],
            ["Fills / stop reason", `${quote.fills.toString()} / ${quote.stopReason.toString()}`]
          ] as const).map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-2"><dt className="text-muted">{label}</dt><dd className="text-right font-semibold text-ink">{value}</dd></div>)}
        </dl><p className="mt-3 text-[11px] leading-5 text-muted">Observed at block {quote.blockNumber.toString()} · {new Date(quote.fetchedAt).toLocaleString()}. Liquidity and price can change; the returned figures are not guaranteed execution terms. The numeric stop reason is shown without guessing its enum label.</p></div>}
      </div>
      <div className="border-t border-line pt-6"><h3 className="font-semibold text-ink">Spend-backed missions</h3><p className="mt-1 text-xs leading-5 text-muted">Auvra already runs real Orbio inference and records provider-reported usage. Creating a mission does not spend wallet CREDIT or activate it.</p><div className="mt-4 flex flex-wrap gap-2"><Link to="/app/missions/new" className="button-primary">Create real mission <ArrowRight className="h-4 w-4" /></Link><Link to="/app/activity" className="button-secondary">View inference ledger</Link></div>
        {recent.length > 0 && <div className="mt-4 space-y-2">{recent.map(m => <Link key={m.id} to={`/app/missions/${m.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-xs transition hover:border-violet/25"><span className="min-w-0 truncate font-semibold text-ink">{m.objective}</span><span className="shrink-0 text-muted">{money(m.actualCostUsd)}</span></Link>)}</div>}
      </div>
      <p className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Activation, buying, allowance approval and autonomous top-ups remain disabled. A read-only quote does not activate your wallet CREDIT or fund your current API key.</p>
    </div>
  </details>;
}
