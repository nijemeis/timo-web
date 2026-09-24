/**
 * Timezone-aware calendar helpers built on Intl only (no date library). Registrations are stored as UTC
 * instants; days, weeks and the 23:59 auto check-out are defined in the location's (or company's) zone.
 */
export const DEFAULT_TZ = "Europe/Amsterdam";

export type LocalParts = { y: number; m: number; d: number; h: number; mi: number; s: number; wd: number };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
    fmtCache.set(tz, f);
  }
  return f;
}
const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Wall-clock parts of an instant in a zone. `wd` is ISO (Mon = 1 … Sun = 7). */
export function localParts(date: Date, tz = DEFAULT_TZ): LocalParts {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(date)) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: WD[p.weekday] };
}

function offsetMs(date: Date, tz: string): number {
  const l = localParts(date, tz);
  return Date.UTC(l.y, l.m - 1, l.d, l.h, l.mi, l.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant at which the wall clock in `tz` reads y-m-d h:mi (m is 1-based; out-of-range days roll over). */
export function zonedTime(y: number, m: number, d: number, h = 0, mi = 0, tz = DEFAULT_TZ): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off = offsetMs(new Date(guess), tz);
  let t = guess - off;
  const off2 = offsetMs(new Date(t), tz);
  if (off2 !== off) t = guess - off2;
  return new Date(t);
}

/** Local midnight that starts the day containing `date`. */
export function startOfDay(date: Date, tz = DEFAULT_TZ): Date {
  const l = localParts(date, tz);
  return zonedTime(l.y, l.m, l.d, 0, 0, tz);
}

export function addDays(date: Date, days: number, tz = DEFAULT_TZ): Date {
  const l = localParts(date, tz);
  return zonedTime(l.y, l.m, l.d + days, l.h, l.mi, tz);
}

/** 23:59 on the local day of `date` — when an unclosed registration is closed with status `auto`. */
export function autoCloseAt(date: Date, tz = DEFAULT_TZ): Date {
  const l = localParts(date, tz);
  return zonedTime(l.y, l.m, l.d, 23, 59, tz);
}

/** yyyy-mm-dd of the local day. */
export function dayKey(date: Date, tz = DEFAULT_TZ): string {
  const l = localParts(date, tz);
  return `${l.y}-${String(l.m).padStart(2, "0")}-${String(l.d).padStart(2, "0")}`;
}

/** Monday 00:00 of the ISO week containing `date`. */
export function startOfWeek(date: Date, tz = DEFAULT_TZ): Date {
  const l = localParts(date, tz);
  return zonedTime(l.y, l.m, l.d - (l.wd - 1), 0, 0, tz);
}

/** ISO week label, e.g. 2026-W39. */
export function isoWeek(date: Date, tz = DEFAULT_TZ): string {
  const l = localParts(date, tz);
  // Thursday of this week decides the ISO year.
  const thu = new Date(Date.UTC(l.y, l.m - 1, l.d + (4 - l.wd)));
  const yearStart = Date.UTC(thu.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thu.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${thu.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Monday 00:00 (local) of an ISO week label. */
export function weekStartFromIso(label: string, tz = DEFAULT_TZ): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(label);
  if (!m) throw new Error(`bad ISO week: ${label}`);
  const y = +m[1], w = +m[2];
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4wd = jan4.getUTCDay() || 7;
  const monday = new Date(Date.UTC(y, 0, 4 - (jan4wd - 1) + (w - 1) * 7));
  return zonedTime(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 0, 0, tz);
}

/** "HH:MM" in the zone. */
export function hm(date: Date, tz = DEFAULT_TZ): string {
  const l = localParts(date, tz);
  return `${String(l.h).padStart(2, "0")}:${String(l.mi).padStart(2, "0")}`;
}

/** Parse "HH:MM" on the local day of `day` into an instant. */
export function atLocalTime(day: Date, hhmm: string, tz = DEFAULT_TZ): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`bad time: ${hhmm}`);
  const l = localParts(day, tz);
  return zonedTime(l.y, l.m, l.d, +m[1], +m[2], tz);
}
