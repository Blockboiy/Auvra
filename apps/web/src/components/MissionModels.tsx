import type { Mission } from "@auvra/shared";
import { ArrowRightLeft, Cpu } from "lucide-react";
import { money } from "./ui";

export interface UsedModel {
  name: string;
  calls: number;
  tokens: number;
  actualCostUsd: number;
  missingCost: boolean;
  planningCalls: number;
  executionCalls: number;
  synthesisCalls: number;
}

/** Only successful inference responses count as models used; failed route attempts never do. */
export function modelsUsed(mission: Mission): UsedModel[] {
  const models = new Map<string, UsedModel>();
  for (const event of mission.events) {
    if (event.type !== "inference.completed" || !event.model) continue;
    const current = models.get(event.model) ?? {
      name: event.model, calls: 0, tokens: 0, actualCostUsd: 0,
      missingCost: false, planningCalls: 0, executionCalls: 0, synthesisCalls: 0
    };
    current.calls += 1;
    current.tokens += event.usage?.total ?? 0;
    current.actualCostUsd += event.cost?.amount ?? 0;
    current.missingCost ||= !event.cost;
    if (event.title === "Final synthesis") current.synthesisCalls += 1;
    else if (event.step === undefined) current.planningCalls += 1;
    else current.executionCalls += 1;
    models.set(event.model, current);
  }
  return [...models.values()];
}

export function MissionModels({ mission }: { mission: Mission }) {
  const models = modelsUsed(mission);
  const fallbacks = mission.events.filter((event) => event.type === "model.fallback");
  const routeFailures = mission.events.filter((event) => event.type === "model.routing.failed");
  return (
    <section className="card mb-6 overflow-hidden" aria-labelledby="mission-models-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <div>
          <h2 id="mission-models-heading" className="flex items-center gap-2 font-semibold text-ink"><Cpu className="h-4 w-4 text-violet" /> Models used</h2>
          <p className="mt-1 text-xs text-muted">Actual serving models from this mission’s persisted inference receipts</p>
        </div>
        <span className="rounded-full bg-violet/[.07] px-3 py-1 text-xs font-semibold text-violet">{models.length} model{models.length === 1 ? "" : "s"}</span>
      </div>
      {models.length ? <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {models.map((model) => <div key={model.name} className="rounded-xl border border-line bg-canvas/50 p-4">
          <p className="break-all text-sm font-semibold text-ink">{model.name}</p>
          <p className="mt-1 text-[11px] text-muted">{[model.planningCalls ? "Planning" : "", model.executionCalls ? "Execution" : "", model.synthesisCalls ? "Final synthesis" : ""].filter(Boolean).join(" · ")}</p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted"><span><strong className="text-ink">{model.calls}</strong> call{model.calls === 1 ? "" : "s"}</span><span><strong className="text-ink">{model.tokens.toLocaleString()}</strong> tokens</span></div>
          <p className="mt-3 text-sm font-semibold text-violet">{money(model.actualCostUsd)} <span className="text-[10px] font-medium text-muted">reported actual{model.missingCost ? " (incomplete)" : ""}</span></p>
        </div>)}
      </div> : <p className="px-5 py-5 text-xs text-muted">No successful inference has been recorded for this mission yet.</p>}
      {fallbacks.length ? <div className="border-t border-line px-5 py-3 text-xs text-amber-800"><span className="inline-flex items-center gap-2 font-semibold"><ArrowRightLeft className="h-3.5 w-3.5" /> {fallbacks.length} model fallback{fallbacks.length === 1 ? "" : "s"}</span><p className="mt-1 leading-5">{fallbacks.map((event) => event.detail).join(" · ")}</p></div> : null}
      {routeFailures.length ? <p className="border-t border-line px-5 py-3 text-xs leading-5 text-red-700">{routeFailures[routeFailures.length - 1]?.detail}</p> : null}
    </section>
  );
}
