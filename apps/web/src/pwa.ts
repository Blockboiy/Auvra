/** Register the install shell only on the production HTTPS build. No offline mission execution. */
export function registerAuvraPwa(): void {
  if (!import.meta.env.PROD || !window.isSecureContext || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .catch((error: unknown) => console.warn("Auvra installation is unavailable:", error));
  }, { once: true });
}
