import { PERMISSIONS, type PermissionId } from "@auvra/shared";
import { ArrowLeft, ArrowRight, Check, CircleDollarSign, LockKeyhole, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiClientError } from "../api";
import { PageHeader } from "../components/ui";

export function NewMission() {
  const navigate = useNavigate();
  const location = useLocation();
  const retry = (location.state as { retry?: { objective?: string; budgetUsd?: number; permissions?: PermissionId[] } } | null)?.retry;
  const [objective, setObjective] = useState(retry?.objective ?? "");
  const [budget, setBudget] = useState(String(retry?.budgetUsd ?? 0.05));
  const [permissions, setPermissions] = useState<PermissionId[]>(retry?.permissions?.filter((id) => PERMISSIONS.some((p) => p.id === id)) ?? []);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const needsWebResearch = /\b(find|list|identify|research|search|look\s*up|get\s+me\s+a\s+list)\b/i.test(objective) && /\b(restaurants?|resturants?|business(?:es)?|compan(?:y|ies)|vendors?|shops?|stores?|places?|websites?|news)\b/i.test(objective);
  const toggle = (id: PermissionId) => setPermissions((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(undefined); setSaving(true);
    try {
      const mission = await api.createMission({ objective, budgetUsd: Number(budget), permissions });
      navigate(`/app/missions/${mission.id}`);
    } catch (caught) {
      const details = caught instanceof ApiClientError && Array.isArray(caught.details) ? ` ${caught.details.join(" ")}` : "";
      setError(`${caught instanceof Error ? caught.message : "Unable to create mission."}${details}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/app" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-violet"><ArrowLeft className="h-4 w-4" /> Back to overview</Link>
      <PageHeader eyebrow="New mission" title={retry ? "Review a new attempt." : "Define the outcome."} description="Auvra will not begin until you review the economic limit, approve permissions, and explicitly start the mission." />
      {retry ? <p className="mb-5 rounded-xl border border-violet/15 bg-violet/[.05] px-4 py-3 text-sm text-ink">Your previous objective and permissions have been copied here. This will create a separate mission; nothing runs until you approve it.</p> : null}
      <form onSubmit={submit} className="space-y-5">
        <section className="card p-5 sm:p-7">
          <div className="mb-5 flex items-start gap-3"><span className="rounded-xl bg-violet/[.08] p-2.5 text-violet"><Sparkles className="h-5 w-5" /></span><div><h2 className="font-semibold text-ink">Mission objective</h2><p className="mt-1 text-sm text-muted">Be specific about the result you want.</p></div></div>
          <label htmlFor="objective" className="mb-2 block text-xs font-semibold text-ink">Objective</label>
          <textarea id="objective" rows={6} maxLength={2000} value={objective} onChange={(event) => setObjective(event.target.value)} className="field resize-none leading-6" placeholder="Example: Calculate a 15% contingency for a $2,400 project budget and record the result as a mission note." required />
          {needsWebResearch ? <p className="mt-3 rounded-xl border border-violet/20 bg-violet/[.05] p-3 text-xs leading-5 text-ink">This objective needs current sources. Approve <strong>Research the public web</strong> below to let Auvra find links rather than guess. Your server also needs a configured search provider.</p> : null}
          <div className="mt-2 flex justify-between text-[11px] text-muted"><span>Minimum 10 characters</span><span>{objective.length}/2,000</span></div>
        </section>
        <section className="grid gap-5 md:grid-cols-2">
          <div className="card p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><CircleDollarSign className="h-5 w-5" /></span><div><h2 className="font-semibold text-ink">Spending limit</h2><p className="mt-1 text-xs text-muted">Orbio inference budget</p></div></div><label htmlFor="budget" className="mb-2 block text-xs font-semibold text-ink">Maximum budget</label><div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">$</span><input id="budget" className="field pl-7" type="number" min="0.001" max="100" step="0.001" value={budget} onChange={(event) => setBudget(event.target.value)} required /></div><p className="mt-3 text-[11px] leading-5 text-muted">Every Orbio inference call is budget-checked. External web-search provider charges, if enabled, are separate and are not included in this mission limit.</p></div>
          <div className="card p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><LockKeyhole className="h-5 w-5" /></span><div><h2 className="font-semibold text-ink">Approved permissions</h2><p className="mt-1 text-xs text-muted">Denied by default</p></div></div><div className="space-y-2.5">{PERMISSIONS.map((permission) => { const checked = permissions.includes(permission.id); return <button key={permission.id} type="button" onClick={() => toggle(permission.id)} aria-pressed={checked} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${checked ? "border-violet/30 bg-violet/[.04]" : "border-line hover:bg-canvas"}`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? "border-violet bg-violet text-white" : "border-line bg-white"}`}>{checked ? <Check className="h-3.5 w-3.5" /> : null}</span><span><span className="block text-xs font-semibold text-ink">{permission.name}</span><span className="mt-1 block text-[11px] leading-4 text-muted">{permission.description}</span></span></button>; })}</div></div>
        </section>
        {error ? <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Link to="/app" className="button-secondary">Cancel</Link><button type="submit" disabled={saving} className="button-primary">{saving ? "Creating…" : "Review mission"}<ArrowRight className="h-4 w-4" /></button></div>
      </form>
    </div>
  );
}
