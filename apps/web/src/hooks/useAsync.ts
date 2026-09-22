import { useCallback, useEffect, useRef, useState } from "react";

export function useAsync<T>(loader: () => Promise<T>, dependencies: unknown[] = [], intervalMs?: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const value = await loader();
      if (mounted.current) { setData(value); setError(undefined); }
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      if (mounted.current && !quiet) setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    mounted.current = true;
    void reload();
    if (intervalMs) {
      const timer = window.setInterval(() => void reload(true), intervalMs);
      return () => { mounted.current = false; window.clearInterval(timer); };
    }
    return () => { mounted.current = false; };
  }, [reload, intervalMs]);

  return { data, error, loading, reload: () => reload(false) };
}
