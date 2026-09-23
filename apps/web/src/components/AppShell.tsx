import { Activity, ArrowUpRight, Gauge, Menu, Plus, Settings, Wallet, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

const nav = [
  { to: "/app", label: "Overview", icon: Gauge, end: true },
  { to: "/app/activity", label: "Spending & activity", icon: Activity },
  { to: "/app/resources", label: "Resources", icon: Wallet },
  { to: "/app/settings", label: "Settings", icon: Settings }
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-violet/[.08] text-violet" : "text-muted hover:bg-white hover:text-ink"}`;

function SidebarContent({ close }: { close?: () => void }) {
  return (
    <>
      <div className="flex h-20 items-center px-5">
        <Link to="/app" onClick={close} aria-label="Auvra workspace" className="inline-flex select-none rounded-lg bg-transparent [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet/50">
          <img src="/brand/auvra-logo-transparent.png" alt="Auvra" className="h-[42px] w-[126px] object-contain" />
        </Link>
      </div>
      <div className="px-3">
        <Link to="/app/missions/new" onClick={close} className="button-primary mb-7 w-full"><Plus className="h-4 w-4" /> New mission</Link>
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-muted/70">Workspace</p>
        <nav className="space-y-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} {...(end ? { end: true } : {})} {...(close ? { onClick: close } : {})} className={navClass}><Icon className="h-[18px] w-[18px]" />{label}</NavLink>
          ))}
        </nav>
      </div>
      <div className="mt-auto p-4">
        <Link to="/" onClick={close} className="mb-3 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-muted transition hover:bg-white hover:text-violet">
          Public site <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <div className="rounded-2xl border border-line bg-white p-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-night">
              <img src="/brand/auvra-monogram.png" alt="" className="h-7 w-7 object-contain" />
            </span>
            <div><p className="text-xs font-semibold text-ink">Protected workspace</p><p className="mt-0.5 text-[11px] text-muted">Phase 2 · Controlled Web3</p></div>
          </div>
        </div>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-[#fbfaff] lg:flex"><SidebarContent /></aside>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close navigation" className="absolute inset-0 bg-night/25 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-[280px] flex-col border-r border-line bg-[#fbfaff] shadow-2xl">
            <button aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute right-3 top-5 rounded-lg p-2 text-muted hover:bg-white"><X className="h-5 w-5" /></button>
            <SidebarContent close={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line/80 bg-canvas/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
          <div className="flex items-center gap-3">
            <button aria-label="Open navigation" onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink hover:bg-white lg:hidden"><Menu className="h-5 w-5" /></button>
            <span className="hidden items-center gap-2 text-xs font-medium text-muted sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" /> Auvra execution workspace</span>
          </div>
          <a href="https://www.orbio.so/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[11px] font-semibold text-muted shadow-sm transition hover:border-violet/30 hover:text-violet focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet/50">
            <span className="h-1.5 w-1.5 rounded-full bg-violet" /> Powered by Orbio
          </a>
        </header>
        <main className="mx-auto max-w-[1380px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
