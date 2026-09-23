import { Download, Smartphone, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let availablePrompt: InstallPromptEvent | null = null;
let installedInSession = false;
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((callback) => callback());

// Keep the browser's one-use prompt while navigating between the public site and Settings.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event: Event) => {
    event.preventDefault();
    availablePrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    availablePrompt = null;
    installedInSession = true;
    notify();
  });
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function useInstallState() {
  const [, redraw] = useState(0);
  useEffect(() => {
    const update = () => redraw((value) => value + 1);
    subscribers.add(update);
    return () => { subscribers.delete(update); };
  }, []);
  return { installed: installedInSession || isStandalone(), canPrompt: availablePrompt !== null };
}

async function requestInstall() {
  const prompt = availablePrompt;
  if (!prompt) return;
  availablePrompt = null; // Browser prompts can be used only once.
  notify();
  await prompt.prompt();
  await prompt.userChoice;
}

export function InstallAppButton() {
  const { installed, canPrompt } = useInstallState();
  if (installed || !canPrompt) return null;
  return <button type="button" className="button-secondary px-6 py-3.5" onClick={() => { void requestInstall(); }}>
    <Download className="h-4 w-4" /> Install Auvra
  </button>;
}

export function InstallAppCard() {
  const { installed, canPrompt } = useInstallState();
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);
  return <section className="card p-5 sm:p-6">
    <div className="flex items-center gap-3"><span className="rounded-xl bg-violet/[.07] p-2.5 text-violet"><Smartphone className="h-5 w-5" /></span><div><h2 className="font-semibold text-ink">Install Auvra</h2><p className="mt-0.5 text-xs text-muted">Open as an app on your device</p></div></div>
    {installed ? <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Auvra is running as an installed app.</p> : <>
      <p className="mt-4 text-xs leading-6 text-muted">Add Auvra to your home screen for quick access and a standalone app window. An internet connection is still required to run missions and view live balances.</p>
      {canPrompt ? <button type="button" className="button-primary mt-4" onClick={() => { void requestInstall(); }}><Download className="h-4 w-4" /> Install Auvra</button> : <p className="mt-4 rounded-xl bg-canvas p-3 text-xs leading-6 text-muted">{isIOS ? "In Safari, tap Share, then Add to Home Screen." : "In Chrome or Edge, use the browser menu and choose Install app (or look for the install icon in the address bar)."}</p>}
    </>}
  </section>;
}
