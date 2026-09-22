import { AlertCircle, CheckCircle2, CircleHelp, Cloud, Coins, KeyRound, LockKeyhole, RefreshCw, Server, ShieldCheck } from "lucide-react";
import type { ProviderCheck, ProviderStatus } from "@auvra/shared";
import { api } from "../api";
import { ErrorState, LoadingState, PageHeader } from "../components/ui";
import { useAsync } from "../hooks/useAsync";

const checks: Array<{ key: keyof ProviderStatus["checks"]; label: string }> = [
  { key: "credentials", label: "Credentials" },
  { key: "gateway", label: "Gateway metadata" },
  { key: "model", label: "Selected model" },
  { key: "toolCalling", label: "Tool metadata" },
  { key: "inference", label: "Last actual inference" }
];

function HealthItem({ label, check }: { label: string; check: ProviderCheck }) {
  const Icon = check.status === "pass" ? CheckCircle2 : check.status === "fail" ? AlertCircle : CircleHelp;
  const tone = check.status === "pass" ? "text-emerald-700 bg-emerald-50" : check.status === "fail" ? "text-red-700 bg-red-50" : "text-amber-800 bg-amber-50";
  return <div className="flex gap-3 border-b border-line py-4 last:border-0">
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>
    <div><p className="text-sm font-semibold text-ink">{label}</p><p className="mt-1 text-xs leading-5 text-muted">{check.message}</p></div>
  </div>;
}

export function SettingsPage() {
  const { data: provider, error, loading, reload } = useAsync(api.providerStatus, []);
  if (loading && !provider) return <LoadingState label="Checking Orbio gateway metadata" />;
  if (error && !provider) return <ErrorState message={error} retry={reload} />;
  if (!provider) return null;
  const operational = provider.overall === "operational";
  const statusTone = operational ? "bg-emerald-50 text-emerald-700" : provider.overall === "unavailable" || provider.overall === "not_configured" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800";
  const statusText = operational ? "Last inference succeeded" : provider.overall === "unavailable" ? "Unavailable / check model" : provider.overall === "not_configured" ? "Not configured" : "Not live-verified";
  return <>
    <PageHeader eyebrow="Configuration" title="Settings" description="Configuration and actual inference health are separate checks." />
    <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
      <div className="space-y-6">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3"><span className="rounded-xl bg-violet/[.07] p-2.5 text-violet"><Cloud className="h-5 w-5" /></span><div><h2 className="font-semibold text-ink">Orbio inference provider</h2><p className="mt-0.5 text-xs text-muted">Backend-only application inference</p></div></div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${statusTone}`}>{operational ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}{statusText}</span>
          </div>
          <dl className="divide-y divide-line px-5 sm:px-6">
            <Row icon={<Server />} label="Gateway" value={provider.baseUrl} />
            <Row icon={<Cloud />} label="Primary model" value={provider.model} />
            <Row icon={<Cloud />} label="Ordered model pool" value={(provider.models ?? [provider.model]).join(" → ")} />
            <Row icon={<KeyRound />} label="API key" value={provider.keyHint ?? "Not configured"} />
            <Row icon={<LockKeyhole />} label="Credential mode" value="Server-side only" />
          </dl>
          {!provider.configured && <p className="mx-5 mb-5 rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs leading-6 text-amber-900 sm:mx-6">Add <code>ORBIO_API_KEY</code> to the repository-root .env and restart the API. Never use a Vite-prefixed secret.</p>}
        </section>
        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-ink">Connection diagnostics</h2><p className="mt-1 text-xs text-muted">Metadata refresh does not run paid inference.</p></div><button type="button" onClick={reload} disabled={loading} className="button-secondary"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh status</button></div>
          {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
          <div className="mt-3">{checks.map(({ key, label }) => <HealthItem key={key} label={label} check={provider.checks[key]} />)}</div>
          <p className="mt-3 text-[11px] leading-5 text-muted">Fallback occurs only when a route explicitly reports that no provider is serving a model. A listed model is not proof that an upstream provider currently serves it. “Last actual inference” updates after the API processes a real request; a new server process has no previous result.</p>
        </section>
      </div>
      <div className="space-y-6">
        <section className="card p-5 sm:p-6"><div className="flex items-center gap-3"><span className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><Coins className="h-5 w-5" /></span><div><h2 className="font-semibold text-ink">Economic reporting</h2><p className="mt-0.5 text-xs text-muted">Provider-reported costs required</p></div></div><p className="mt-4 text-xs leading-6 text-muted">Auvra stops conservatively when a successful inference response lacks cost metadata. USD mission spend is not Orbio CREDIT or an on-chain transaction. Failed or uncertain upstream requests may still incur charges.</p></section>
        <section className="card p-5 sm:p-6"><p className="eyebrow">Phase 1 boundary</p><h2 className="mt-2 font-semibold text-ink">Web3-ready, not Web3-active</h2><div className="mt-4 flex gap-2 text-xs leading-5 text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Economic records are structured for future resource providers.</div><div className="mt-3 flex gap-2 text-xs leading-5 text-muted"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> CREDIT monitoring, wallets, signing, transfers, and top-ups are not enabled.</div></section>
      </div>
    </div>
    <div className="mt-6 rounded-2xl border border-line bg-white px-5 py-4 text-xs leading-5 text-muted"><strong className="text-ink">Local-only security notice:</strong> the workspace has no production authentication or tenant isolation. Do not expose it publicly until access controls and deployment hardening are in place.</div>
  </>;
}

function Row({ icon, label, value }: { icon: React.ReactElement; label: string; value: string }) {
  return <div className="grid gap-2 py-4 sm:grid-cols-[180px_1fr] sm:items-center"><dt className="flex items-center gap-2 text-xs font-medium text-muted"><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>{label}</dt><dd className="break-all text-xs font-semibold text-ink sm:text-right">{value}</dd></div>;
}
