import type { MissionEvent } from "@auvra/shared";
import { Activity, ArrowRight, Bot, CheckCircle2, CircleDollarSign, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { modelsUsed } from "../components/MissionModels";
import { dateTime, EmptyState, ErrorState, LoadingState, money, PageHeader, StatusBadge } from "../components/ui";
import { useAsync } from "../hooks/useAsync";

const eventDot = (event: MissionEvent) => event.status === "success" ? "bg-emerald-500" : event.status === "error" ? "bg-red-500" : "bg-violet";

export function Dashboard() {
  const { data, error, loading, reload } = useAsync(api.dashboard, [], 4_000);
  if (loading && !data) return <LoadingState label="Preparing your mission control" />;
  if (error && !data) return <ErrorState message={error} retry={reload} />;
  const stats = [
    { label: "Total missions", value: data?.totals.missions ?? 0, icon: Bot, tone: "bg-violet/[.08] text-violet" },
    { label: "Active now", value: data?.totals.active ?? 0, icon: Activity, tone: "bg-blue-50 text-blue-600" },
    { label: "Completed", value: data?.totals.completed ?? 0, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" },
    { label: "Recorded spend", value: money(data?.totals.actualCostUsd ?? 0), icon: CircleDollarSign, tone: "bg-amber-50 text-amber-700" }
  ];
  return (
    <>
      <PageHeader eyebrow="Mission control" title="Good to see you." description="Assign outcomes, control economic exposure, and watch every autonomous action unfold." action={<Link className="button-primary" to="/app/missions/new"><Plus className="h-4 w-4" />New mission</Link>} />
      <section className="relative mb-6 overflow-hidden rounded-[24px] bg-night p-6 text-white shadow-card sm:p-8">
        <div className="soft-grid absolute inset-0 opacity-20" />
        <div className="absolute -right-16 -top-32 h-72 w-72 rounded-full bg-violet/35 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl"><p className="mb-3 flex items-center gap-2 text-xs font-semibold text-violet-200"><Sparkles className="h-4 w-4" /> Bounded autonomy, by design</p><h2 className="text-2xl font-semibold tracking-[-.03em] sm:text-3xl">Give AI the outcome.<br />Keep control of the spend.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-white/65">Auvra plans, acts through approved tools, and records provider-reported costs against your hard mission limit.</p></div>
          <Link to="/app/missions/new" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-night transition hover:bg-violet-50">Create a mission <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => <div key={label} className="card p-5"><div className="mb-5 flex items-center justify-between"><span className="text-xs font-medium text-muted">{label}</span><span className={`rounded-xl p-2 ${tone}`}><Icon className="h-4 w-4" /></span></div><p className="text-2xl font-bold tracking-[-.03em] text-ink">{value}</p></div>)}
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="font-semibold text-ink">Recent missions</h2><p className="mt-0.5 text-xs text-muted">Newest objectives and current state</p></div></div>
          {data?.recentMissions.length ? <div className="divide-y divide-line">{data.recentMissions.map((mission) => <Link key={mission.id} to={`/app/missions/${mission.id}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-violet/[.02]"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-violet"><Bot className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink group-hover:text-violet">{mission.objective}</p><p className="mt-1 text-xs text-muted">{dateTime(mission.createdAt)} · {money(mission.actualCostUsd)} actual · {modelsUsed(mission).map((model) => model.name).join(", ") || "No model completed yet"}</p></div><StatusBadge status={mission.status} /><ArrowRight className="hidden h-4 w-4 text-muted/50 sm:block" /></Link>)}</div> : <EmptyState icon={<Bot className="h-6 w-6" />} title="Your first mission starts here" description="Define an objective, set a USD budget, approve only the tools it needs, then start execution explicitly." action={<Link className="button-primary" to="/app/missions/new">Create first mission</Link>} />}
        </section>
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4"><h2 className="font-semibold text-ink">Live activity</h2><p className="mt-0.5 text-xs text-muted">The latest audited events</p></div>
          {data?.recentEvents.length ? <div className="divide-y divide-line px-5">{data.recentEvents.map((event) => <div key={event.id} className="flex gap-3 py-4"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${eventDot(event)}`} /><div><p className="text-sm font-medium text-ink">{event.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{event.detail ?? dateTime(event.createdAt)}</p></div></div>)}</div> : <EmptyState icon={<Activity className="h-6 w-6" />} title="No activity yet" description="Mission planning, inference, tool actions, and completion events will appear here." />}
        </section>
      </div>
    </>
  );
}
