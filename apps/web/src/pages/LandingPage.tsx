import {
  Activity, ArrowRight, Bot, Check, CircleDollarSign, Gauge, KeyRound,
  Layers3, LockKeyhole, Menu, Orbit, ShieldCheck, Sparkles, X, Zap
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

const ORBIO_URL = "https://www.orbio.so/";

const navItems: { label: string; href: string; external?: boolean }[] = [
  { label: "Product", href: "#product" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Economics", href: "#economics" },
  { label: "Powered by Orbio", href: ORBIO_URL, external: true }
];

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const previous = document.body.style.overflow;
    if (menuOpen) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [menuOpen]);
  const close = () => setMenuOpen(false);

  return (
    <div className="overflow-hidden bg-white text-ink">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/60 bg-white/85 backdrop-blur-xl">
        <nav aria-label="Public navigation" className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" aria-label="Auvra home" className="inline-flex select-none rounded-lg bg-transparent [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet/50">
            <img src="/brand/auvra-logo-transparent.png" alt="Auvra" className="h-11 w-[152px] object-contain object-left" />
          </Link>
          <div className="hidden min-w-0 flex-1 items-center justify-evenly gap-4 px-7 lg:flex xl:px-12">
            {navItems.map((item) => <a key={item.href} href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} className="whitespace-nowrap text-sm font-semibold text-muted transition hover:text-violet focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet/40">{item.label}</a>)}
          </div>
          <a href="/demo-login" className="button-primary hidden lg:inline-flex">Open Workspace <ArrowRight className="h-4 w-4" /></a>
          <button aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="rounded-xl border border-line p-2.5 text-night transition hover:border-violet/30 hover:text-violet focus:outline-none focus:ring-4 focus:ring-violet/15 lg:hidden"><Menu className="h-5 w-5" /></button>
        </nav>
      </header>

      {menuOpen ? <div className="fixed inset-0 z-[60] bg-white lg:hidden"><div className="flex h-[76px] items-center justify-between border-b border-line px-5 sm:px-8"><img src="/brand/auvra-logo-transparent.png" alt="Auvra" className="h-11 w-[152px] object-contain object-left" /><button aria-label="Close navigation" onClick={close} className="rounded-xl border border-line p-2.5 text-night focus:outline-none focus:ring-4 focus:ring-violet/15"><X className="h-5 w-5" /></button></div><div className="flex h-[calc(100%-76px)] flex-col px-6 py-8"><nav className="space-y-1">{navItems.map((item, index) => <a key={item.href} href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined} onClick={close} className="flex items-center justify-between border-b border-line py-5 text-xl font-semibold tracking-[-.02em] text-ink"><span><span className="mr-4 text-xs font-bold text-violet">0{index + 1}</span>{item.label}</span><ArrowRight className="h-5 w-5 text-muted" /></a>)}</nav><div className="mt-auto"><a href={ORBIO_URL} target="_blank" rel="noopener noreferrer" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-violet"><span className="h-2 w-2 rounded-full bg-violet" /> Powered by Orbio</a><a href="/demo-login" onClick={close} className="button-primary w-full py-3.5">Open Workspace <ArrowRight className="h-4 w-4" /></a></div></div></div> : null}

      <main>
        <section className="relative min-h-[760px] bg-[linear-gradient(180deg,#fbfaff_0%,#fff_100%)] pt-24 sm:pt-28">
          <div className="landing-grid absolute inset-0 opacity-60" />
          <div className="absolute left-1/2 top-28 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-violet/[.08] blur-[110px]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:gap-10">
            <div className="max-w-3xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-violet/15 bg-white px-3.5 py-2 text-xs font-semibold text-violet shadow-sm"><Sparkles className="h-3.5 w-3.5" /> Intelligence with spending power.</div>
              <h1 className="text-[46px] font-bold leading-[.98] tracking-[-.06em] text-night sm:text-6xl lg:text-[76px]">Give AI the outcome.<br /><span className="bg-gradient-to-r from-violet to-glow bg-clip-text text-transparent">Keep control of the spend.</span></h1>
              <p className="mt-7 max-w-2xl text-base leading-8 text-muted sm:text-lg">Give autonomous agents an objective, a budget and permissions. Auvra handles execution while making every action and inference cost visible.</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row"><a href="/demo-login" className="button-primary px-6 py-3.5">Open Workspace <ArrowRight className="h-4 w-4" /></a><a href="#how-it-works" className="button-secondary px-6 py-3.5">See How It Works</a></div>
              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-muted"><span className="flex items-center gap-2"><Check className="h-4 w-4 text-violet" /> Explicit permissions</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-violet" /> Provider-reported costs</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-violet" /> Bounded execution</span></div>
            </div>
            <HeroVisual />
          </div>
        </section>

        <section id="product" className="scroll-mt-24 bg-night py-24 text-white sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8"><SectionIntro dark eyebrow="The product" title="Mission control for autonomous work." copy="A real workspace for assigning outcomes, reviewing agent decisions, and understanding the economics behind every run." /><WorkspacePreview /></div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 bg-white py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8"><SectionIntro eyebrow="How Auvra works" title="From objective to auditable output." copy="A deliberate five-stage loop keeps autonomous execution legible, bounded, and under your control." /><div className="relative mt-14 grid gap-4 md:grid-cols-5"><div className="absolute left-[10%] right-[10%] top-8 hidden h-px bg-gradient-to-r from-transparent via-violet/30 to-transparent md:block" />{([
            ["01", "Define", "State the outcome, not a sequence of prompts.", Sparkles], ["02", "Budget", "Allocate a clear USD inference limit.", CircleDollarSign], ["03", "Permit", "Approve only the tools the mission needs.", KeyRound], ["04", "Execute", "Auvra plans, acts, observes and adapts.", Zap], ["05", "Review", "Inspect output, actions, tokens and costs.", Activity]
          ] as const).map(([number, title, copy, Icon]) => <div key={String(number)} className="relative rounded-2xl border border-line bg-white p-5 transition duration-300 hover:-translate-y-1 hover:border-violet/25 hover:shadow-card"><span className="relative z-10 mb-7 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet/10 bg-violet/[.06] text-violet"><Icon className="h-6 w-6" /></span><p className="eyebrow">{number}</p><h3 className="mt-2 text-lg font-semibold text-ink">{title}</h3><p className="mt-2 text-sm leading-6 text-muted">{copy}</p></div>)}</div></div>
        </section>

        <section id="economics" className="scroll-mt-24 bg-canvas py-24 sm:py-32">
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2"><div><SectionIntro eyebrow="Autonomous economic control" title="Beyond the chatbot window." copy="Auvra turns inference into a governed operating resource. Every mission carries its own objective, authority boundary, execution limits, and economic record." /><div className="mt-9 grid gap-3 sm:grid-cols-2">{([
            ["Objectives", "A durable definition of done.", Bot], ["Permissions", "Server-enforced tool boundaries.", LockKeyhole], ["Inference spend", "Actual costs separated from estimates.", CircleDollarSign], ["Activity records", "An audit trail for every action.", Layers3]
          ] as const).map(([title, copy, Icon]) => <div key={String(title)} className="rounded-2xl border border-line bg-white p-5"><Icon className="h-5 w-5 text-violet" /><h3 className="mt-4 text-sm font-semibold text-ink">{title}</h3><p className="mt-1 text-xs leading-5 text-muted">{copy}</p></div>)}</div></div><EconomicVisual /></div>
        </section>

        <section id="orbio" className="scroll-mt-24 bg-white py-24 sm:py-32"><div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="relative overflow-hidden rounded-[32px] bg-night px-6 py-12 text-white sm:px-12 sm:py-16 lg:px-16"><div className="landing-grid absolute inset-0 opacity-10" /><div className="absolute -right-24 -top-32 h-96 w-96 rounded-full border border-violet/30" /><div className="absolute -right-8 -top-20 h-72 w-72 rounded-full border border-glow/30" /><div className="relative grid gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center"><div><a href={ORBIO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-2 text-xs font-semibold text-violet-200 transition hover:bg-white/[.12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"><Orbit className="h-4 w-4" /> Powered by Orbio</a><h2 className="mt-6 text-3xl font-bold tracking-[-.045em] sm:text-5xl">Inference with an economic record.</h2></div><div><p className="text-base leading-8 text-white/65">Auvra uses the Orbio gateway for model inference and records the usage and cost metadata reported with each successful response. Credentials remain on the server.</p><div className="mt-7 grid gap-3 sm:grid-cols-3"><MiniFact title="Current" copy="Gateway inference, usage and cost reporting" /><MiniFact title="Controlled" copy="Mission budgets and explicit permissions" /><MiniFact title="Future" copy="CREDIT and authorized resource management" /></div><p className="mt-6 text-xs leading-5 text-white/45">Wallet signing, automatic top-ups, token transfers and autonomous on-chain transactions are not enabled in Phase 1.</p></div></div></div></div></section>

        <section className="bg-white pb-24 pt-8 sm:pb-32"><div className="mx-auto max-w-5xl px-5 text-center sm:px-8"><img src="/brand/auvra-monogram.png" alt="" className="mx-auto h-20 w-20 object-contain" /><p className="eyebrow mt-7">Ready when you are</p><h2 className="mt-4 text-4xl font-bold tracking-[-.055em] text-night sm:text-6xl">Give AI a task and a budget.<br />Auvra handles the execution.</h2><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted">Start in your private local workspace. Define the outcome, approve the boundary, and keep the economics visible.</p><a href="/demo-login" className="button-primary mt-9 px-7 py-3.5">Open Workspace <ArrowRight className="h-4 w-4" /></a></div></section>
      </main>

      <footer className="border-t border-line bg-[#fbfaff]" aria-label="Auvra footer">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 pb-12 pt-16 sm:px-8 lg:grid-cols-[1.7fr_1fr_1fr_1fr]">
          <div className="max-w-sm"><img src="/brand/auvra-logo-transparent.png" alt="Auvra" className="h-12 w-[146px] object-contain object-left" /><p className="mt-5 text-sm leading-7 text-muted">Intelligence with spending power. Set an objective, approve its tools, and see what Auvra did and what it cost.</p><a href="/demo-login" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-violet hover:underline">Open Workspace <ArrowRight className="h-4 w-4" /></a></div>
          <div><h3 className="text-xs font-bold uppercase tracking-wider text-night">Product</h3><nav aria-label="Footer product links" className="mt-6 flex flex-col gap-3 text-sm text-muted"><a className="hover:text-violet" href="#product">Workspace preview</a><a className="hover:text-violet" href="/app/missions/new">Create a mission</a><a className="hover:text-violet" href="#how-it-works">How it works</a></nav></div>
          <div><h3 className="text-xs font-bold uppercase tracking-wider text-night">Platform</h3><nav aria-label="Footer platform links" className="mt-6 flex flex-col gap-3 text-sm text-muted"><a className="hover:text-violet" href="#economics">Economic control</a><a className="hover:text-violet" href="/app/activity">Spending &amp; activity</a><a className="hover:text-violet" href="/app/settings">Provider status</a></nav></div>
          <div><h3 className="text-xs font-bold uppercase tracking-wider text-night">Ecosystem</h3><nav aria-label="Footer ecosystem links" className="mt-6 flex flex-col gap-3 text-sm text-muted"><a className="hover:text-violet" href={ORBIO_URL} target="_blank" rel="noopener noreferrer">Powered by Orbio</a><a className="hover:text-violet" href="https://github.com/Blockboiy/Auvra" target="_blank" rel="noreferrer noopener">GitHub repository</a><span className="text-xs leading-5">Web3 resource management is in development.</span></nav></div>
        </div>
        <div className="border-t border-line"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8"><span>© 2026 Auvra. Built for transparent autonomous execution.</span><a href={ORBIO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-violet"><span className="h-1.5 w-1.5 rounded-full bg-violet" /> Powered by Orbio · Phase 1 MVP</a></div></div>
      </footer>
    </div>
  );
}

function SectionIntro({ eyebrow, title, copy, dark = false }: { eyebrow: string; title: string; copy: string; dark?: boolean }) {
  return <div className="max-w-3xl"><p className="eyebrow">{eyebrow}</p><h2 className={`mt-4 text-3xl font-bold tracking-[-.045em] sm:text-5xl ${dark ? "text-white" : "text-night"}`}>{title}</h2><p className={`mt-5 max-w-2xl text-base leading-8 ${dark ? "text-white/55" : "text-muted"}`}>{copy}</p></div>;
}

function HeroVisual() {
  return (
    <div className="relative mx-auto h-[470px] w-full max-w-[560px]">
      <div className="absolute left-1/2 top-1/2 h-[370px] w-[370px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet/15" />
      <div className="absolute left-1/2 top-1/2 h-[270px] w-[470px] -translate-x-1/2 -translate-y-1/2 rotate-[-18deg] rounded-[50%] border border-violet/25" />
      <div className="absolute right-[9%] top-[18%] h-4 w-4 rounded-full bg-glow shadow-[0_0_34px_rgba(146,84,255,.8)]" />
      <div className="absolute inset-x-7 top-14 rotate-[1.5deg] rounded-[28px] border border-line bg-white p-5 shadow-[0_32px_90px_rgba(33,23,71,.16)]">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-night"><img src="/brand/auvra-monogram.png" alt="" className="h-8 w-8 object-contain" /></span>
            <div><p className="text-sm font-semibold">Example mission</p><p className="text-[10px] text-muted">Illustrative preview, not a live run</p></div>
          </div>
          <span className="rounded-full bg-violet/[.07] px-2.5 py-1 text-[10px] font-bold text-violet">EXAMPLE</span>
        </div>
        <div className="py-5">
          <p className="text-[10px] font-bold uppercase tracking-[.15em] text-muted">Objective</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-ink">Calculate (18 × 7) + 5 and save the answer as a mission note.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PreviewCell icon={<CircleDollarSign />} label="Example budget" value="$0.25 limit" />
          <PreviewCell icon={<ShieldCheck />} label="Approved tools" value="Math + notes" />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-canvas px-3 py-3">
          <span className="text-[11px] font-medium text-muted">No inference before approval</span>
          <a href="/app/missions/new" className="shrink-0 rounded-lg bg-violet px-3 py-2 text-[10px] font-bold text-white transition hover:bg-[#5d27e3]">Create mission</a>
        </div>
      </div>
    </div>
  );
}

function PreviewCell({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="rounded-xl border border-line p-3"><span className="text-violet [&>svg]:h-4 [&>svg]:w-4">{icon}</span><p className="mt-3 text-[10px] text-muted">{label}</p><p className="mt-1 text-xs font-semibold">{value}</p></div>; }

function WorkspacePreview() {
  const sampleSteps = [
    { title: "Mission created", detail: "Example objective and budget recorded." },
    { title: "User approval", detail: "Math and notes permissions explicitly granted." },
    { title: "Calculation completed", detail: "The sample arithmetic tool returned 131." },
    { title: "Result recorded", detail: "Sample result saved to mission notes." }
  ];

  return (
    <div className="relative mt-14 overflow-hidden rounded-[28px] border border-white/10 bg-[#f8f7fc] p-2 shadow-[0_35px_100px_rgba(0,0,0,.3)] sm:p-3">
      <div className="flex min-h-[560px] overflow-hidden rounded-[20px] bg-canvas text-ink">
        <aside className="hidden w-52 shrink-0 border-r border-line bg-white p-4 sm:block">
          <img src="/brand/auvra-logo-transparent.png" alt="Auvra" className="h-9 w-28 object-contain" />
          <div className="mt-8 rounded-xl bg-violet px-3 py-3 text-xs font-semibold text-white">+ New mission</div>
          <div className="mt-7 space-y-2"><PreviewNav active icon={<Gauge />} text="Overview" /><PreviewNav icon={<Activity />} text="Spending & activity" /><PreviewNav icon={<LockKeyhole />} text="Settings" /></div>
        </aside>
        <div className="min-w-0 flex-1 p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet">Illustrative example · not real usage</p><h3 className="mt-2 text-xl font-bold">Mission control</h3></div>
            <a href={ORBIO_URL} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line bg-white px-3 py-1.5 text-[10px] font-semibold text-muted transition hover:text-violet">Powered by Orbio</a>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <PreviewMetric title="Example objective" text="Calculate and save 131" />
            <PreviewMetric title="Example budget" text="$0.25 limit" />
            <PreviewMetric title="Actual spending" text="Shown after a real run" />
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-sm font-semibold">Example execution history</p>
              <p className="mt-1 text-[10px] leading-5 text-muted">A sample workflow to show how completed actions appear.</p>
              <div className="mt-5 space-y-4">
                {sampleSteps.map((step) => (
                  <div key={step.title} className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Check className="h-4 w-4" /></span>
                    <div className="min-w-0"><p className="text-xs font-semibold text-ink">{step.title}</p><p className="mt-1 text-[11px] leading-5 text-muted">{step.detail}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-line bg-white p-5">
                <p className="text-xs font-semibold">Economic control</p>
                <p className="mt-3 text-[11px] leading-5 text-muted">The mission's spending limit is checked before paid calls. Real provider costs are recorded separately from estimates.</p>
                <p className="mt-4 text-xs font-bold text-violet">Sample budget: $0.25</p>
              </div>
              <div className="rounded-2xl bg-night p-5 text-white">
                <ShieldCheck className="h-5 w-5 text-violet-300" /><p className="mt-3 text-xs font-semibold">Permissions enforced</p><p className="mt-1 text-[10px] leading-5 text-white/60">Only approved application tools can run.</p>
              </div>
              <a href="/demo-login" className="inline-flex items-center gap-2 text-xs font-semibold text-violet hover:underline">Open the real workspace <ArrowRight className="h-3.5 w-3.5" /></a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewNav({ icon, text, active = false }: { icon: ReactNode; text: string; active?: boolean }) { return <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-medium ${active ? "bg-violet/[.08] text-violet" : "text-muted"}`}><span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>{text}</div>; }
function PreviewMetric({ title, text }: { title: string; text: string }) { return <div className="rounded-2xl border border-line bg-white p-4"><p className="text-[10px] text-muted">{title}</p><p className="mt-2 text-xs font-semibold">{text}</p></div>; }
function MiniFact({ title, copy }: { title: string; copy: string }) { return <div className="rounded-xl border border-white/10 bg-white/[.05] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-violet-200">{title}</p><p className="mt-2 text-xs leading-5 text-white/60">{copy}</p></div>; }

function EconomicVisual() {
  return <div className="relative mx-auto w-full max-w-lg rounded-[28px] border border-line bg-white p-6 shadow-card sm:p-8"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold">Mission economics</p><p className="mt-1 text-[10px] text-muted">Clear by construction</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">RECORDED</span></div><div className="mt-7 grid grid-cols-2 gap-3"><PreviewMetric title="Spending limit" text="Set before execution" /><PreviewMetric title="Actual cost" text="Reported by provider" /><PreviewMetric title="Remaining" text="Checked before calls" /><PreviewMetric title="Estimates" text="Clearly separated" /></div><div className="mt-6 rounded-2xl bg-canvas p-5"><div className="flex items-center justify-between text-xs"><span className="text-muted">Execution boundary</span><span className="font-semibold text-ink">Bounded</span></div><div className="mt-4 flex gap-2"><span className="h-2 flex-[3] rounded-full bg-violet" /><span className="h-2 flex-1 rounded-full bg-violet/20" /><span className="h-2 flex-1 rounded-full bg-violet/10" /></div><p className="mt-4 text-[10px] leading-5 text-muted">Preflight checks reduce economic exposure; upstream reporting limits prevent an absolute guarantee.</p></div></div>;
}
