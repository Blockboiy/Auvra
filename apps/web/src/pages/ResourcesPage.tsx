import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, ArrowUpRight, CheckCircle2, Coins, ExternalLink, Info,
  LoaderCircle, RefreshCw, ShieldCheck, Wallet, Zap
} from "lucide-react";
import { PageHeader } from "../components/ui";
import {
  ORBIO_CREDIT_ADDRESS, ROBINHOOD_CHAIN_ID, ROBINHOOD_EXPLORER,
  connectWallet, connectedAddress, currentChainId, formatUnits, readCreditSnapshot,
  switchToRobinhood, walletErrorMessage, walletOptions,
  type CreditSnapshot
} from "../web3/credit";

const shortened = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const creditExplorer = `${ROBINHOOD_EXPLORER}/address/${ORBIO_CREDIT_ADDRESS}`;

function Stat({ label, value, detail, icon: Icon }: {
  label: string; value: string; detail: string; icon: typeof Coins;
}) {
  return <div className="card p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-muted">{label}</span><span className="rounded-xl bg-violet/[.07] p-2 text-violet"><Icon className="h-5 w-5" /></span></div>
    <p className="mt-5 break-all text-2xl font-bold tracking-[-.04em] text-ink">{value}</p>
    <p className="mt-2 text-xs leading-5 text-muted">{detail}</p>
  </div>;
}

export function ResourcesPage() {
  const [wallets, setWallets] = useState(walletOptions);
  const [selected, setSelected] = useState(0);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<CreditSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const sequence = useRef(0);
  const wallet = wallets[selected]?.provider;

  const refresh = useCallback(async () => {
    const operation = ++sequence.current;
    setError(null);
    if (!wallet || hidden) {
      setAccount(null); setChainId(null); setSnapshot(null); setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const address = await connectedAddress(wallet);
      const chain = await currentChainId(wallet);
      if (operation !== sequence.current) return;
      setAccount(address);
      setChainId(chain);
      setSnapshot(null);
      if (address && chain === ROBINHOOD_CHAIN_ID) {
        const data = await readCreditSnapshot(wallet, address);
        if (operation !== sequence.current) return;
        // Discard an in-flight result if the wallet account was switched while reading.
        if ((await connectedAddress(wallet))?.toLowerCase() !== address.toLowerCase()) return;
        if (operation !== sequence.current) return;
        setSnapshot(data);
      }
    } catch (cause) {
      if (operation === sequence.current) { setSnapshot(null); setError(walletErrorMessage(cause)); }
    } finally {
      if (operation === sequence.current) setBusy(false);
    }
  }, [wallet, hidden]);

  useEffect(() => {
    void refresh();
    if (!wallet) return;
    const listener = () => { void refresh(); };
    wallet.on?.("accountsChanged", listener);
    wallet.on?.("chainChanged", listener);
    return () => {
      sequence.current++;
      wallet.removeListener?.("accountsChanged", listener);
      wallet.removeListener?.("chainChanged", listener);
    };
  }, [wallet, refresh]);

  async function connect() {
    if (!wallet) return;
    setError(null); setBusy(true);
    try {
      await connectWallet(wallet);
      if (hidden) setHidden(false); // The effect will refresh after the hidden state changes.
      else await refresh();
    } catch (cause) {
      setError(walletErrorMessage(cause)); setBusy(false);
    }
  }

  async function changeNetwork() {
    if (!wallet) return;
    setError(null); setBusy(true);
    try { await switchToRobinhood(wallet); await refresh(); }
    catch (cause) { setError(walletErrorMessage(cause)); setBusy(false); }
  }

  function hideWallet() {
    sequence.current++;
    setHidden(true); setAccount(null); setChainId(null); setSnapshot(null); setError(null); setBusy(false);
  }

  const correctNetwork = chainId === ROBINHOOD_CHAIN_ID;
  const connected = Boolean(account) && !hidden;
  const creditAmount = snapshot ? formatUnits(snapshot.creditRaw, snapshot.creditDecimals) : "—";
  const ethAmount = snapshot ? formatUnits(snapshot.ethWei, 18) : "—";

  return <>
    <PageHeader eyebrow="Phase 2 · Resource management" title="Your intelligence, funded."
      description="Connect an EVM wallet to inspect your Orbio CREDIT holdings on Robinhood Chain. All blockchain access in this release is read-only." />

    <div className="mb-6 rounded-2xl border border-violet/15 bg-gradient-to-r from-violet/[.07] via-white to-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><span className="rounded-lg bg-violet/10 p-2 text-violet"><Wallet className="h-5 w-5" /></span><span className="eyebrow">Wallet connection</span></div>
          <h2 className="mt-3 break-all text-lg font-semibold text-ink">{connected && account ? shortened(account) : "Connect your wallet"}</h2>
          <p className="mt-1 text-xs leading-5 text-muted">{connected && correctNetwork ? "Robinhood Chain · Connected" : connected ? "Different network selected" : "Your wallet stays in your browser. No private keys or signatures are sent to Auvra."}</p>
          {connected && account && <a href={`${ROBINHOOD_EXPLORER}/address/${account}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet hover:underline">View wallet on Blockscout <ExternalLink className="h-3.5 w-3.5" /></a>}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {!wallets.length ? <button type="button" className="button-primary" onClick={() => setWallets(walletOptions())}>Detect wallets</button> : <>
            {wallets.length > 1 && <label className="w-full text-xs text-muted sm:w-auto">Wallet
              <select className="field mt-1 sm:min-w-36" value={selected} onChange={(event) => { sequence.current++; setSelected(Number(event.target.value)); setHidden(false); setAccount(null); setChainId(null); setSnapshot(null); }}>
                {wallets.map((option, index) => <option key={option.id} value={index}>{option.name}</option>)}
              </select>
            </label>}
            {!connected ? <button type="button" className="button-primary" disabled={busy} onClick={() => void connect()}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Connect {wallets[selected]?.name ?? "wallet"}</button> : <>
              {!correctNetwork ? <button type="button" className="button-primary" disabled={busy} onClick={() => void changeNetwork()}>Switch to Robinhood Chain</button> : <button type="button" className="button-secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Refresh</button>}
              <button type="button" onClick={hideWallet} className="button-secondary">Hide wallet</button>
            </>}
          </>}
        </div>
      </div>
      {!wallets.length && <p className="mt-4 text-xs text-muted">Install or enable an EVM browser wallet such as MetaMask or Rabby, then select Detect wallets. Mobile visitors can use an in-wallet browser.</p>}
      {hidden && <p className="mt-3 text-xs text-muted">Wallet hidden in Auvra. To revoke a site's wallet permission, use your wallet extension's connected-sites settings.</p>}
      {error && <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
    </div>

    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Stat label="Wallet CREDIT" value={creditAmount} detail={snapshot ? `On-chain token balance · ${snapshot.creditDecimals} decimals` : "Actual token balance, not a simulated amount"} icon={Coins} />
      <Stat label="ETH for network fees" value={ethAmount} detail="Native ETH balance on Robinhood Chain; no transfers are enabled" icon={Zap} />
      <Stat label="Activated AI resources" value="Not integrated" detail="Orbio API balance needs a separately verified account endpoint; wallet CREDIT is not activated inference balance" icon={ShieldCheck} />
    </div>

    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-5 sm:px-6"><h2 className="font-semibold text-ink">On-chain verification</h2><p className="mt-1 text-xs text-muted">Direct wallet RPC reads from the documented Orbio CREDIT contract.</p></div>
        <dl className="divide-y divide-line px-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs"><dt className="text-muted">Network</dt><dd className="font-semibold text-ink">Robinhood Chain (4663) {connected && correctNetwork ? <CheckCircle2 className="ml-1 inline h-4 w-4 text-emerald-600" /> : null}</dd></div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs"><dt className="text-muted">CREDIT contract</dt><dd className="min-w-0 break-all font-semibold text-violet"><a href={creditExplorer} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">{shortened(ORBIO_CREDIT_ADDRESS)} <ArrowUpRight className="h-3 w-3" /></a></dd></div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs"><dt className="text-muted">Last observed block</dt><dd className="font-semibold text-ink">{snapshot ? snapshot.blockNumber.toString() : "—"}</dd></div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs"><dt className="text-muted">Last refreshed</dt><dd className="font-semibold text-ink">{snapshot ? new Date(snapshot.readAt).toLocaleString() : "—"}</dd></div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs"><dt className="text-muted">Data source</dt><dd className="font-semibold text-ink">{snapshot ? "Live wallet RPC response" : "Connect wallet to read"}</dd></div>
        </dl>
      </section>
      <div className="space-y-6">
        <section className="card p-5 sm:p-6"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /><h2 className="font-semibold text-ink">Read-only by design</h2></div><p className="mt-3 text-xs leading-6 text-muted">This release can request account access, switch networks and read token balances. It cannot sign, transfer, activate, purchase or top up CREDIT. Wallet connection is separate from mission approval.</p></section>
        <section className="card p-5 sm:p-6"><div className="flex items-center gap-2"><Info className="h-5 w-5 text-violet" /><h2 className="font-semibold text-ink">What comes next?</h2></div><p className="mt-3 text-xs leading-6 text-muted">CREDIT activation and funding require verified contract methods, user-approved transactions and authoritative activation receipts. They are not enabled in this release.</p><a href="https://www.orbio.so/protocol" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet hover:underline">Read Orbio's CREDIT protocol <ExternalLink className="h-3.5 w-3.5" /></a></section>
      </div>
    </div>
  </>;
}
