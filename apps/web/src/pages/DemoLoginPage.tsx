import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export function DemoLoginPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/dashboard", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal
    })
      .then((response) => {
        if (controller.signal.aborted) return;

        if (response.ok) {
          navigate("/app", { replace: true });
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setChecking(false);
      });

    return () => controller.abort();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-md rounded-3xl border border-line bg-white p-8 shadow-card sm:p-10">

        <a href="/" className="mb-8 inline-flex">
          <img
            src="/brand/auvra-logo-transparent.png"
            alt="Auvra"
            className="h-12 w-auto object-contain"
          />
        </a>

        {checking ? (
          <div role="status" className="py-8 text-center">
            <p className="font-semibold text-ink">Checking workspace access</p>
            <p className="mt-2 text-sm text-muted">
              Preparing your Auvra session...
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-ink">
              Welcome to Auvra
            </h1>

            <p className="mt-3 text-sm leading-6 text-muted">
              Enter your demo access password to continue.
            </p>

            <form method="POST" action="/demo-login" className="mt-8">
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-semibold text-ink"
              >
                Demo password
              </label>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="field"
                required
                autoFocus
              />

              <button
                type="submit"
                className="button-primary mt-5 w-full"
              >
                Open workspace
              </button>
            </form>

            <a
              href="/"
              className="mt-6 inline-block text-sm font-medium text-violet"
            >
              Back to public site
            </a>
          </>
        )}
      </div>
    </div>
  );
}
