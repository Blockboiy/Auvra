import type { Mission, MissionEvent } from "@auvra/shared";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Cpu, FileCheck2, ShieldCheck, Wrench } from "lucide-react";
import { dateTime, money } from "./ui";

const completedTool = (name: string) => ({ calculate: "Calculation completed", record_note: "Mission note saved", get_current_time: "Current time checked", web_search: "Public sources found" } as Record<string, string>)[name] ?? "Approved action completed";

function humanize(event: MissionEvent): { title: string; description: string; phase: string } {
  switch (event.type) {
    case "mission.created": return { title: "Mission prepared", description: "Your objective, budget and permissions were recorded.", phase: "Setup" };
    case "mission.started": return { title: "You approved the mission", description: "Auvra started working within the approved limits.", phase: "Setup" };
    case "plan.created": return { title: "Plan created", description: event.detail || "Auvra prepared the next steps.", phase: "Planning" };
    case "inference.completed": return { title: event.step === undefined ? "AI prepared the plan" : `AI processed step ${event.step}`, description: `A response was received${event.model ? ` from ${event.model.split("/").pop()}` : ""} and its usage was recorded.`, phase: event.step === undefined ? "Planning" : "Execution" };
    case "tool.started": return { title: "Approved action started", description: "Auvra is performing a permitted operation.", phase: "Execution" };
    case "tool.completed": return { title: completedTool(event.tool?.name ?? ""), description: "The application performed this action and saved the result.", phase: "Execution" };
    case "tool.failed": return { title: "An approved action could not finish", description: event.detail ?? "This action returned an error.", phase: "Execution" };
    case "model.fallback": return { title: "Auvra switched models", description: event.detail ?? "The previous route was unavailable.", phase: "Execution" };
    case "model.routing.failed": return { title: "Model connection stopped", description: event.detail ?? "No model completed this request.", phase: "Execution" };
    case "mission.completed": return { title: "Mission completed", description: "Your final response is ready above.", phase: "Outcome" };
    case "mission.cancelled": return { title: "Mission cancelled", description: "Execution stopped at your request.", phase: "Outcome" };
    case "mission.failed": return { title: "Mission paused before completion", description: event.detail ?? "Execution ended before a final result was returned.", phase: "Outcome" };
    default: return { title: event.title, description: event.detail ?? "", phase: "Execution" };
  }
}

function DetailsValue({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  const content = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return <div className="min-w-0"><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p><pre className="max-h-64 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 font-mono text-[11px] leading-5 text-ink">{content}</pre></div>;
}

export function MissionJourney({ mission }: { mission: Mission }) {
  // The normal view hides a duplicate tool.started row when a matching completion exists.
  // The advanced disclosure still preserves every original persisted event.
  const visible = mission.events.filter((event, index, events) => event.type !== "tool.started" || !events.slice(index + 1).some((after) => after.step === event.step && after.tool?.name === event.tool?.name && (after.type === "tool.completed" || after.type === "tool.failed")));
  let lastPhase = "";
  return <section className="card overflow-hidden" aria-labelledby="auvra-journey-heading">
    <div className="border-b border-line px-5 py-5 sm:px-6"><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-violet" /><h2 id="auvra-journey-heading" className="font-semibold text-ink">What Auvra did</h2></div><p className="mt-1 text-xs leading-5 text-muted">A clear step-by-step record. Expand an item to inspect its technical details.</p></div>
    <ol className="px-5 py-3 sm:px-6">{visible.map((event) => {
      const copy = humanize(event);
      const showPhase = copy.phase !== lastPhase;
      lastPhase = copy.phase;
      const Icon = event.status === "error" ? AlertTriangle : event.type === "inference.completed" ? Cpu : event.type.startsWith("tool.") ? Wrench : event.type === "mission.completed" ? FileCheck2 : event.status === "success" ? CheckCircle2 : event.type === "mission.started" ? ShieldCheck : Clock3;
      return <li key={event.id} className="relative border-b border-line/75 py-4 last:border-0">
        {showPhase ? <p className="mb-3 text-[10px] font-bold uppercase tracking-[.15em] text-violet">{copy.phase}</p> : null}
        <div className="flex gap-3"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${event.status === "error" ? "bg-red-50 text-red-600" : event.status === "success" ? "bg-emerald-50 text-emerald-600" : "bg-violet/[.07] text-violet"}`}><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-semibold text-ink">{copy.title}</h3><time dateTime={event.createdAt} className="text-[11px] text-muted">{dateTime(event.createdAt)}</time></div><p className="mt-1 text-xs leading-5 text-muted">{copy.description}</p>
        <div className="mt-2 flex flex-wrap gap-2">{event.model ? <span className="rounded-lg bg-violet/[.06] px-2 py-1 text-[11px] font-medium text-violet">Model: {event.model.split("/").pop()}</span> : null}{event.cost ? <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">Actual cost: {money(event.cost.amount)}</span> : null}{event.usage ? <span className="rounded-lg bg-canvas px-2 py-1 text-[11px] text-muted">{event.usage.total.toLocaleString()} tokens</span> : null}</div>
        <details className="mt-3 rounded-xl border border-line bg-canvas/60"><summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-muted hover:text-violet">View details</summary><div className="space-y-3 border-t border-line px-3 py-3"><DetailsValue label="Recorded event" value={event.title} /><DetailsValue label="Provider or action detail" value={event.detail} /><DetailsValue label="Action input" value={event.tool?.input} /><DetailsValue label="Action result" value={event.tool?.output} /><DetailsValue label="Model ID" value={event.model} /></div></details>
        </div></div>
      </li>;
    })}</ol>
    <details className="border-t border-line bg-canvas/30 px-5 py-4 sm:px-6"><summary className="cursor-pointer text-xs font-semibold text-muted hover:text-violet">Advanced: original audit log ({mission.events.length} events)</summary><pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-4 font-mono text-[11px] leading-5 text-ink">{JSON.stringify(mission.events, null, 2)}</pre></details>
  </section>;
}
