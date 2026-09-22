import type { MissionStatus } from "@auvra/shared";
import { AlertCircle, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export const money = (value: number, maximumFractionDigits = 6) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits }).format(value);

export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const statusStyles: Record<MissionStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  queued: "bg-indigo-50 text-indigo-700",
  planning: "bg-violet-50 text-violet",
  running: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-600",
  budget_exhausted: "bg-amber-50 text-amber-800"
};

export function StatusBadge({ status }: { status: MissionStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${statusStyles[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status.replace("_", " ")}
    </span>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="text-2xl font-bold tracking-[-0.035em] text-ink sm:text-[30px]">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading Auvra" }: { label?: string }) {
  return (
    <div className="card flex min-h-52 items-center justify-center gap-3 text-sm font-medium text-muted">
      <LoaderCircle className="h-5 w-5 animate-spin text-violet" /> {label}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="card flex min-h-52 flex-col items-center justify-center px-6 text-center">
      <span className="mb-3 rounded-xl bg-red-50 p-2.5 text-red-600"><AlertCircle className="h-5 w-5" /></span>
      <p className="font-semibold text-ink">Something needs attention</p>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {retry ? <button className="button-secondary mt-4" onClick={retry}>Try again</button> : null}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 rounded-2xl bg-violet/[.07] p-3 text-violet">{icon}</span>
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
