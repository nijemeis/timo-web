"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/fetcher";

/** Current time, re-rendering every `ms`. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(iv);
  }, [ms]);
  return now;
}

/**
 * Load JSON from the API, optionally polling. `reload()` refetches; the previous data stays on screen
 * while a refetch runs, so polling never flashes a loading state.
 */
export function useApi<T>(url: string | null, opts: { poll?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const n = ++seq.current;
    try {
      const d = await api<T>(url);
      if (n === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (n === seq.current) setError(e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    setLoading(true);
    load();
    if (!opts.poll) return;
    const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, opts.poll);
    return () => clearInterval(iv);
  }, [load, opts.poll]);
  return { data, error, loading, reload: load, setData };
}
