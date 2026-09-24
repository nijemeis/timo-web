/**
 * Locale formatting for the web UIs: dates in en-GB / nl-NL, durations "8h 12m" / "8u 12m",
 * decimals "8.5" / "8,5". Times are shown in the company's time zone.
 */
import type { Lang } from "./index";

const pad = (n: number) => String(n).padStart(2, "0");
export const locale = (lang: Lang) => (lang === "nl" ? "nl-NL" : "en-GB");

/** "8h 05m" / "8u 05m" — as in the design. */
export function dur(ms: number, lang: Lang): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(m / 60)}${lang === "nl" ? "u" : "h"} ${pad(m % 60)}m`;
}

/** One-decimal hours: 8.5 / 8,5. */
export function num(v: number, lang: Lang, digits = 1): string {
  const s = v.toFixed(digits);
  return lang === "nl" ? s.replace(".", ",") : s;
}

/** Hours from milliseconds, one decimal. */
export const hrs = (ms: number, lang: Lang) => num(ms / 3600_000, lang);

/** "08:52" in a zone. */
export function hm(iso: string | Date, tz: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** "Thursday 24 September" / "donderdag 24 september". */
export function longDay(d: Date | string, lang: Lang, tz: string): string {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(d));
}

/** "Mon 21 Sept" / "ma 21 sep" (the prototype's Intl format for needs-attention cards). */
export function shortDay(d: Date | string, lang: Lang, tz: string): string {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(d));
}

const MON = { en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], nl: ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] };
const MONTH_LONG = { en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], nl: ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"] };

function ymd(d: Date | string, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(d));
  const g = (t: string) => +(p.find((x) => x.type === t)?.value ?? 0);
  return { y: g("year"), m: g("month"), d: g("day") };
}

/** "23 Sep". */
export function dayMon(d: Date | string, lang: Lang, tz: string): string {
  const x = ymd(d, tz);
  return `${x.d} ${MON[lang][x.m - 1]}`;
}

/** "Jan 2026" / "jan 2026". */
export function monYear(d: Date | string, lang: Lang, tz: string): string {
  const x = ymd(d, tz);
  return `${MON[lang][x.m - 1]} ${x.y}`;
}

/** "September" / "September" (capitalised for segment labels). */
export function monthName(month1: number, lang: Lang): string {
  const s = MONTH_LONG[lang][month1 - 1];
  return s[0].toUpperCase() + s.slice(1);
}

/** Day of month of a yyyy-mm-dd key. */
export const dom = (key: string) => +key.slice(8, 10);

/** "21–27 Sep" or "28 Sep–4 Oct" for a list of yyyy-mm-dd keys. */
export function rangeLabel(firstKey: string, lastKey: string, lang: Lang): string {
  const m1 = +firstKey.slice(5, 7), m2 = +lastKey.slice(5, 7);
  if (m1 === m2) return `${dom(firstKey)}–${dom(lastKey)} ${MON[lang][m2 - 1]}`;
  return `${dom(firstKey)} ${MON[lang][m1 - 1]}–${dom(lastKey)} ${MON[lang][m2 - 1]}`;
}

/** Week number from "2026-W39". */
export const weekNo = (iso: string) => +iso.slice(6);

/** "1–2", "5", "13, 15" for a list of minors. */
export function minorRange(list: number[]): string {
  if (!list.length) return "—";
  const s = [...list].sort((a, b) => a - b);
  const contiguous = s.every((v, i) => i === 0 || v === s[i - 1] + 1);
  if (s.length === 1) return String(s[0]);
  return contiguous ? `${s[0]}–${s[s.length - 1]}` : s.join(", ");
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).filter((w, i, a) => i === 0 || i === a.length - 1).map((w) => w[0].toUpperCase()).join("").slice(0, 2);
