/** Client-side JSON helper for the Timo API. Throws ApiErr with the server's machine-readable code. */
import type { Dict } from "./i18n";

export class ApiErr extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    throw new ApiErr(0, "network", "No connection.");
  }
  if (!res.ok) {
    let body: { error?: { code?: string; message?: string; fields?: Record<string, string> } } = {};
    try { body = await res.json(); } catch { /* not JSON */ }
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
      window.location.href = "/login";
    }
    throw new ApiErr(res.status, body.error?.code ?? "server", body.error?.message ?? res.statusText, body.error?.fields);
  }
  if (init.raw) return res as unknown as T;
  return (await res.json()) as T;
}

/** Localised message for an error: known codes are translated, others fall back to the server's English copy. */
export function errText(e: unknown, t: Dict): string {
  if (e instanceof ApiErr) {
    if (e.code === "network") return t.errNetwork;
    return t.errCodes[e.code] ?? (e.message || t.errGeneric);
  }
  return t.errGeneric;
}
