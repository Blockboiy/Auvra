import { ArrowLeft, ArrowRight, CircleDollarSign, Cpu, ExternalLink, OctagonX, Play, ScrollText, ShieldCheck, Square } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { MissionModels } from "../components/MissionModels";
import { MissionJourney } from "../components/MissionJourney";
import { MissionResult } from "../components/MissionResult";
import { dateTime, ErrorState, LoadingState, money, StatusBadge } from "../components/ui";
import { useAsync } from "../hooks/useAsync";

const activeStatuses = ["queued", "planning", "running"];

export function MissionDetail() {
  const { id = "" } = useParams();
  const { data: mission, error, loading, reload } = useAsync(() => api.mission(id), [id], 2_000);
  const [actionError, setActionError] = useState<string>();
  const [acting, setActing] = useState(false);
  const perform = async (action: "start" | "cancel") => {
    setActing(true); setActionError(undefined);
    try { action === "start" ? await api.startMission(id) : await api.cancelMission(id); await reload(); }
    catch (caught) { setActionError(caught instanceof Error ? caught.message : "Action failed."); }
    finally { setActing(false); }
  };
  if (loading && !mission) return <LoadingState label="Loading mission" />;
  if (error && !mission) return <ErrorState message={error} retry={reload} />;
  if (!mission) return null;
  const remaining = Math.max(0, mission.budgetUsd - mission.actualCostUsd);
  const spendPercentage = Math.min(100, mission.budgetUsd ? (mission.actualCostUsd / mission.budgetUsd) * 100 : 0);
  const sources = [...new Map(mission.events.flatMap((event) => {
    if (event.type !== "tool.completed" || event.tool?.name !== "web_search") return [];
    const output = event.tool.output as { results?: Array<{ title?: string; url?: string; description?: string }> } | undefined;
    return (output?.results ?? []).filter((item): item is { title: string; url: string; description?: string } =>
      typeof item.title === "string" && typeof item.url === "string" && /^https?:\/\//.test(item.url)
    ).map((item) => [item.url, item] as const);
  })).values()];
  return (
    <>
      <Link to="/app" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-violet"><ArrowLeft className="h-4 w-4" /> Back to overview</Link>
      <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl"><div className="mb-3 flex flex-wrap items-center gap-2"><StatusBadge status={mission.status} /><span className="text-xs text-muted">Created {dateTime(mission.createdAt)}</span></div><h1 className="text-2xl font-bold leading-tight tracking-[-.035em] text-ink sm:text-[30px]">{mission.objective}</h1><p className="mt-3 text-sm text-muted">Step {mission.currentStep} of {mission.maxSteps} · {mission.permissions.length} approved permission{mission.permissions.length === 1 ? "" : "s"}</p></div>
        <div className="flex shrink-0 gap-2">{mission.status === "draft" ? <button disabled={acting} onClick={() => void perform("start")} className="button-primary"><Play className="h-4 w-4 fill-current" />{acting ? "Starting…" : "Start mission"}</button> : null}{activeStatuses.includes(mission.status) ? <button disabled={acting} onClick={() => void perform("cancel")} className="button-secondary text-red-600"><Square className="h-3.5 w-3.5 fill-current" />{acting ? "Cancelling…" : "Cancel"}</button> : null}</div>
      </div>
      {mission.status === "draft" ? <div className="mb-6 flex gap-3 rounded-2xl border border-violet/15 bg-violet/[.04] p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet" /><div><p className="text-sm font-semibold text-ink">Execution is paused for your approval</p><p className="mt-1 text-xs leading-5 text-muted">Review the objective, budget, and permission boundary below. No Orbio call has been made.</p></div></div> : null}
      {actionError ? <div role="alert" className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div> : null}
      {mission.error ? <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><div className="flex min-w-0 flex-1 gap-3"><OctagonX className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="text-sm font-semibold">This mission could not finish</p><p className="mt-1 text-xs leading-5">{mission.error}</p><p className="mt-2 text-xs leading-5">Any completed work and provider-reported charges remain saved below. A new attempt needs your approval.</p></div></div><Link to="/app/missions/new" state={{ retry: { objective: mission.objective, budgetUsd: mission.budgetUsd, permissions: mission.permissions } }} className="button-secondary whitespace-nowrap text-xs">Start a new attempt <ArrowRight className="h-4 w-4" /></Link></div> : null}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Budget limit" value={money(mission.budgetUsd)} icon={<CircleDollarSign />} />
        <Metric label="Actual provider spend" value={money(mission.actualCostUsd)} note="Provider-reported" icon={<Cpu />} />
        <Metric label="Remaining budget" value={money(remaining)} icon={<ShieldCheck />} />
        <Metric label="Token usage" value={mission.usage.total.toLocaleString()} note={`${mission.usage.input.toLocaleString()} in · ${mission.usage.output.toLocaleString()} out`} icon={<ScrollText />} />
      </div>
      <MissionResult mission={mission} />
      {sources.length > 0 ? <section className="card mb-6 overflow-hidden" aria-label="Public sources consulted"><div className="border-b border-line px-5 py-4 sm:px-6"><h2 className="font-semibold text-ink">Sources consulted</h2><p className="mt-1 text-xs leading-5 text-muted">Links returned by actual public web searches. Listings are leads; checkout capability may need direct verification.</p></div><ul className="divide-y divide-line/70">{sources.map((source) => <li key={source.url} className="px-5 py-3 sm:px-6"><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-2 break-words text-sm font-semibold text-violet hover:underline">{source.title}<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>{source.description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{source.description}</p> : null}</li>)}</ul></section> : null}
      <MissionModels mission={mission} />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <MissionJourney mission={mission} />
        <div className="space-y-6">
          <section className="card p-5"><h2 className="font-semibold text-ink">Economic control</h2><div className="mt-5 h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-gradient-to-r from-violet to-glow transition-all" style={{ width: `${spendPercentage}%` }} /></div><div className="mt-3 flex justify-between text-xs"><span className="text-muted">{spendPercentage.toFixed(1)}% used</span><span className="font-semibold text-ink">{money(remaining)} left</span></div><div className="mt-5 border-t border-line pt-4"><div className="flex justify-between text-xs"><span className="text-muted">Cumulative preflight estimates</span><span className="font-semibold text-ink">{money(mission.estimatedCostUsd)}</span></div><p className="mt-2 text-[11px] leading-5 text-muted">Estimates reserve capacity before calls. They are not billed spend and are kept separate from provider-reported actuals.</p></div></section>
          <section className="card p-5"><h2 className="font-semibold text-ink">Plan</h2>{mission.plan ? <><p className="mt-2 text-xs leading-5 text-muted">{mission.plan.summary}</p><ol className="mt-4 space-y-3">{mission.plan.steps.map((step, index) => <li key={`${index}-${step}`} className="flex gap-3 text-xs leading-5 text-ink"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet/[.08] text-[10px] font-bold text-violet">{index + 1}</span>{step}</li>)}</ol></> : <p className="mt-2 text-xs leading-5 text-muted">The plan will be generated after explicit start approval.</p>}</section>
          <section className="card p-5"><h2 className="font-semibold text-ink">Permissions</h2><div className="mt-3 flex flex-wrap gap-2">{mission.permissions.length ? mission.permissions.map((permission) => <span key={permission} className="rounded-lg bg-violet/[.06] px-2.5 py-1.5 text-[11px] font-semibold text-violet">{permission}</span>) : <span className="text-xs text-muted">No application tools approved.</span>}</div></section>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, note, icon }: { label: string; value: string; note?: string; icon: React.ReactElement }) {
  return <div className="card p-5"><div className="mb-4 flex items-center justify-between"><span className="text-xs font-medium text-muted">{label}</span><span className="rounded-lg bg-violet/[.07] p-2 text-violet">{icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>}</span></div><p className="text-xl font-bold tracking-[-.03em] text-ink">{value}</p>{note ? <p className="mt-1 text-[10px] text-muted">{note}</p> : null}</div>;
}
