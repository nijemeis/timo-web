/**
 * Pass-the-gate rules, as a pure decision function so they can be tested without a database. `events.ts`
 * feeds it one event at a time and applies what it returns.
 *
 * The phone decides what a pass means — it toggles: out → "enter" (check in), in → "exit" (check out), and
 * a pass only counts after the beacon was out of sight for the company's away time and the pass lock has
 * elapsed. Being out of range in between means nothing: a field worker miles from the gate stays checked in.
 * The server applies the intent:
 * - enter while not checked in → check in at the pass time
 * - enter while already checked in (another phone of the same person, a replay) → "seen", nothing changes
 * - exit while checked in → check out at the pass time (any company beacon; the gate needn't be the same)
 * - exit while not checked in → ignored
 * Nothing by 23:59 local → the sweep closes it with status `auto` (see registrations.ts).
 */
export type EngineOpen = { id: string; minor: number | null; locationId: string | null; checkInAt: Date };
export type EngineClosed = { id: string; locationId: string | null; checkOutAt: Date; status: string; source: string } | null;
export type EngineEvent = { type: "enter" | "exit"; minor: number; locationId: string | null; at: Date };

export type Decision =
  | { kind: "ignore"; reason: "stale" | "not_active" }
  | { kind: "seen"; regId: string; at: Date }
  | { kind: "checkin"; at: Date }
  | { kind: "checkout"; regId: string; at: Date };

export function decide(open: EngineOpen | null, lastClosed: EngineClosed, ev: EngineEvent): Decision {
  if (ev.type === "enter") {
    if (open) return ev.at < open.checkInAt ? { kind: "ignore", reason: "stale" } : { kind: "seen", regId: open.id, at: ev.at };
    if (lastClosed && ev.at < lastClosed.checkOutAt) return { kind: "ignore", reason: "stale" };
    return { kind: "checkin", at: ev.at };
  }
  if (!open) return { kind: "ignore", reason: "not_active" };
  if (ev.at < open.checkInAt) return { kind: "ignore", reason: "stale" };
  return { kind: "checkout", regId: open.id, at: ev.at };
}

/** Minutes a registration counts for totals: auto check-outs count for nothing until resolved. */
export function countedMs(r: { checkInAt: Date; checkOutAt: Date | null; status: string }, now: Date): number {
  if (r.status === "auto") return 0;
  const end = r.checkOutAt ?? now;
  return Math.max(0, end.getTime() - r.checkInAt.getTime());
}

/** Timesheet status for a user-week: Review beats Approved beats Ready. */
export function sheetStatus(regs: { status: string }[], approved: boolean): "review" | "approved" | "ready" {
  if (regs.some((r) => r.status === "auto" || r.status === "pending")) return "review";
  return approved ? "approved" : "ready";
}

/** Validation for correction requests (handoff: out after in, same day, at most 16 h). */
export function validateCorrection(inAt: Date, outAt: Date, sameDay: (a: Date, b: Date) => boolean): string | null {
  if (!(outAt > inAt)) return "out_before_in";
  if (!sameDay(inAt, outAt)) return "not_same_day";
  if (outAt.getTime() - inAt.getTime() > 16 * 3600_000) return "too_long";
  return null;
}
