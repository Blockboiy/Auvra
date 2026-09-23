import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUpRight, CheckCircle2, Clock3, LoaderCircle, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { formatUnits, walletErrorMessage, type CreditSnapshot, type Eip1193Provider } from "../web3/credit";
import {
  checkTransferReceipt, loadTransferRecords, prepareCreditTransfer, saveTransferRecord,
  submitCreditTransfer, transferExplorerUrl, type TransferQuote, type TransferRecord
} from "../web3/transactions";

interface Props {
  provider: Eip1193Provider | undefined;
  account: string | null;
  snapshot: CreditSnapshot | null;
  onBalanceRefresh: () => Promise<void>;
}

const short = (text: string) => `${text.slice(0, 6)}…${text.slice(-4)}`;

export function CreditTransferPanel({ provider, account, snapshot, onBalanceRefresh }: Props) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [records, setRecords] = useState<TransferRecord[]>([]);
  const submitLock = useRef(false);

  // Account changes invalidate an existing preview and isolate the browser-local history.
  useEffect(() => {
    setQuote(null); setAccepted(false); setError(null); setInfo(null);
    setRecipient(""); setAmount("");
    setRecords(account ? loadTransferRecords(account) : []);
  }, [account]);

  const pending = records.some((record) => record.status === "submitted" || record.status === "verification_needed");
  const ready = Boolean(provider && account && snapshot && snapshot.account.toLowerCase() === account.toLowerCase());

  async function prepare() {
    if (!provider || !snapshot || !account || busy || pending) return;
    setBusy(true); setError(null); setInfo(null); setQuote(null); setAccepted(false);
    try {
      const next = await prepareCreditTransfer(provider, snapshot, recipient, amount);
      setQuote(next);
    } catch (cause) { setError(walletErrorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!provider || !quote || !accepted || busy || submitLock.current || pending) return;
    submitLock.current = true;
    setBusy(true); setError(null); setInfo(null);
    try {
      const record = await submitCreditTransfer(provider, quote);
      saveTransferRecord(record);
      setRecords(loadTransferRecords(record.from));
      setQuote(null); setAccepted(false); setRecipient(""); setAmount("");
      setInfo(`Submitted: ${record.hash}. Await chain confirmation before creating another transfer.`);
      void onBalanceRefresh();
    } catch (cause) {
      setError(`${walletErrorMessage(cause)} If the wallet showed a submission, inspect wallet activity before trying again.`);
      setQuote(null); setAccepted(false);
    } finally { setBusy(false); submitLock.current = false; }
  }

  async function check(record: TransferRecord) {
    if (!provider || checking) return;
    setChecking(record.hash); setError(null);
    try {
      const updated = await checkTransferReceipt(provider, record);
      saveTransferRecord(updated);
      setRecords(loadTransferRecords(record.from));
      if (updated.status === "confirmed" || updated.status === "reverted") void onBalanceRefresh();
    } catch (cause) { setError(walletErrorMessage(cause)); }
    finally { setChecking(null); }
  }

  return <section className="card overflow-hidden" aria-labelledby="credit-transfer-heading">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-5 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-violet/[.07] p-2.5 text-violet"><Send className="h-5 w-5" /></span>
        <div><h2 id="credit-transfer-heading" className="font-semibold text-ink">Send CREDIT</h2><p className="mt-0.5 text-xs text-muted">One explicit wallet approval per transfer. No automated spending.</p></div>
      </div>
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">User-approved only</span>
    </div>
    <div className="space-y-5 p-5 sm:p-6">
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
        CREDIT transfers are on-chain and may be irreversible. Sending CREDIT does not activate inference resources. You need ETH for gas. This public demo does not store or receive your wallet keys.
      </div>
      {pending && <p role="status" className="rounded-xl border border-violet/15 bg-violet/[.05] px-4 py-3 text-xs leading-5 text-ink">You have an unverified submission in this browser. Check its receipt below before preparing another transfer. Auvra never automatically retries uncertain transactions.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-ink">Recipient wallet address
          <input className="field mt-2 w-full" autoComplete="off" spellCheck={false} value={recipient}
            onChange={(event) => { setRecipient(event.target.value); setQuote(null); setAccepted(false); }}
            placeholder="0x…" disabled={!ready || busy || pending} />
        </label>
        <label className="block text-xs font-semibold text-ink">Amount (CREDIT)
          <input className="field mt-2 w-full" inputMode="decimal" autoComplete="off" value={amount}
            onChange={(event) => { setAmount(event.target.value); setQuote(null); setAccepted(false); }}
            placeholder="e.g. 0.1" disabled={!ready || busy || pending} />
        </label>
      </div>
      <p className="text-xs text-muted">Available wallet balance: <strong className="text-ink">{snapshot ? formatUnits(snapshot.creditRaw, snapshot.creditDecimals) : "—"} CREDIT</strong>. Activated inference balance is separate.</p>
      <button type="button" className="button-secondary" disabled={!ready || busy || pending || !recipient.trim() || !amount.trim()} onClick={() => void prepare()}>
        {busy && !quote ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Review transfer
      </button>
      {!ready && <p className="text-xs text-muted">Connect and refresh a wallet on Robinhood Chain to prepare a transfer.</p>}

      {quote && <div className="space-y-4 rounded-2xl border border-violet/20 bg-violet/[.04] p-4 sm:p-5">
        <p className="text-sm font-semibold text-ink">Confirm transaction details</p>
        <dl className="divide-y divide-violet/10 text-xs">
          <div className="flex justify-between gap-4 py-2"><dt className="text-muted">Network</dt><dd className="text-right font-semibold text-ink">Robinhood Chain (4663)</dd></div>
          <div className="flex justify-between gap-4 py-2"><dt className="text-muted">Token</dt><dd className="text-right font-semibold text-ink">Orbio CREDIT</dd></div>
          <div className="flex justify-between gap-4 py-2"><dt className="text-muted">Send</dt><dd className="text-right font-semibold text-ink">{formatUnits(quote.creditRaw, quote.decimals)} CREDIT</dd></div>
          <div className="flex justify-between gap-4 py-2"><dt className="text-muted">To</dt><dd className="break-all text-right font-semibold text-ink">{quote.recipient}</dd></div>
          <div className="flex justify-between gap-4 py-2"><dt className="text-muted">Estimated gas</dt><dd className="text-right font-semibold text-ink">~{formatUnits(quote.estimatedFeeWei, 18, 10)} ETH</dd></div>
        </dl>
        <p className="text-[11px] leading-5 text-muted">Gas is an estimate, not a fee cap. Your wallet shows the final transaction details. Auvra does not sign on your behalf.</p>
        <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-ink"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 accent-violet" /> I checked the recipient, amount and chain. I understand this transfer is separate from activation and may be irreversible.</label>
        <div className="flex flex-wrap gap-2"><button type="button" className="button-primary" disabled={!accepted || busy || !ready} onClick={() => void submit()}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Confirm in wallet</button><button type="button" className="button-secondary" disabled={busy} onClick={() => { setQuote(null); setAccepted(false); }}>Cancel</button></div>
      </div>}
      {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
      {info && <p role="status" className="break-all rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">{info}</p>}
    </div>
    <div className="border-t border-line px-5 py-5 sm:px-6">
      <h3 className="font-semibold text-ink">Transaction activity <span className="ml-2 text-[11px] font-normal text-muted">This browser · current wallet</span></h3>
      <p className="mt-1 text-xs leading-5 text-muted">Transaction hashes are saved locally in this browser, not on Auvra's server. Reloading preserves these local receipts. Check the chain explorer for authoritative status.</p>
      {!records.length ? <p className="mt-4 rounded-xl bg-canvas p-4 text-xs text-muted">No transfers recorded on this browser for the connected address.</p> :
        <div className="mt-4 space-y-3">{records.map((record) => <div key={record.hash} className="rounded-xl border border-line p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-ink">{formatUnits(BigInt(record.creditRaw), record.decimals)} CREDIT → {short(record.recipient)}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${record.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : record.status === "reverted" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{record.status.replace("_", " ")}</span></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><a href={transferExplorerUrl(record.hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-violet hover:underline">{short(record.hash)} <ArrowUpRight className="h-3.5 w-3.5" /></a><span className="text-muted">{new Date(record.submittedAt).toLocaleString()}</span></div>
          {(record.status === "submitted" || record.status === "verification_needed") && <button type="button" className="button-secondary mt-3" disabled={!provider || Boolean(checking)} onClick={() => void check(record)}>{checking === record.hash ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check receipt</button>}
          {record.status === "confirmed" && <p className="mt-2 flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Confirmed on-chain; this is not an activated AI balance.</p>}
          {record.status === "verification_needed" && <p className="mt-2 text-amber-800">Receipt details did not match the expected transaction. Verify on Blockscout before taking further action.</p>}
          {record.status === "submitted" && <p className="mt-2 flex items-center gap-1 text-amber-800"><Clock3 className="h-3.5 w-3.5" /> Waiting for an authoritative receipt.</p>}
        </div>)}</div>}
    </div>
  </section>;
}
