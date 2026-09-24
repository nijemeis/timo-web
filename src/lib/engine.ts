/**
 * The check-in/check-out rules from the handoff, as a pure decision function so they can be tested
 * without a database. `events.ts` feeds it one event at a time and applies what it returns.
 *
 * - enter while not checked in → check in at the event time
 * - enter the same minor while in → just "still seen"
 * - enter a different minor while in → close the current registration at that moment, open a new one
 * - exit of the active minor → check out at the event time (the phone reports the *last seen* time,
 *   after its own grace period)
 * - enter again at the same location within the grace period after a beacon check-out → reopen
 *   (a safety net for phones that sent an exit too early, e.g. when the app was killed)
 */
export type EngineOpen = { id: string; minor: number | null; locationId: string | null; checkInAt: Date };
export type EngineClosed = { id: string; locationId: string | null; checkOutAt: Date; status: string; source: string } | null;
export type EngineEvent = { type: "enter" | "exit"; minor: number; locationId: string | null; at: Date };

export type Decision =
  | { kind: "ignore"; reason: "stale" | "not_active" }
  | { kind: "seen"; regId: string; at: Date }
  | { kind: "checkin"; at: Date }
  | { kind: "checkout"; regId: string; at: Date }
  | { kind: "switch"; closeId: string; at: Date }
  | { kind: "reopen"; regId: string; at: Date };

export function decide(open: EngineOpen | null, lastClosed: EngineClosed, ev: EngineEvent, graceMs: number): Decision {
  if (ev.type === "enter") {
    if (open) {
      if (ev.at < open.checkInAt) return { kind: "ignore", reason: "stale" };
      if (open.minor === ev.minor) return { kind: "seen", regId: open.id, at: ev.at };
      return { kind: "switch", closeId: open.id, at: ev.at };
    }
    if (
      lastClosed &&
      lastClosed.status === "ok" &&
      lastClosed.source === "beacon" &&
      lastClosed.locationId === ev.locationId &&
      ev.at >= lastClosed.checkOutAt &&
      ev.at.getTime() - lastClosed.checkOutAt.getTime() <= graceMs
    ) {
      return { kind: "reopen", regId: lastClosed.id, at: ev.at };
    }
    if (lastClosed && ev.at < lastClosed.checkOutAt) return { kind: "ignore", reason: "stale" };
    return { kind: "checkin", at: ev.at };
  }
  if (!open || open.minor !== ev.minor) return { kind: "ignore", reason: "not_active" };
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
