import { en, type Dict } from "./en";
import { nl } from "./nl";

export type Lang = "en" | "nl";
export type { Dict };
export const LANG_COOKIE = "timo_lang";
export const dicts: Record<Lang, Dict> = { en, nl };

/** Pick a language from a cookie value or an Accept-Language header (default English). */
export function pickLang(cookie?: string | null, acceptLanguage?: string | null): Lang {
  if (cookie === "en" || cookie === "nl") return cookie;
  const first = (acceptLanguage ?? "").split(",").map((s) => s.trim().toLowerCase().split(";")[0]).find(Boolean);
  return first?.startsWith("nl") ? "nl" : "en";
}

/** Replace `{key}` placeholders. */
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

export * from "./format";
