import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, countedMs, sheetStatus, validateCorrection } from "./engine";
import { autoCloseAt, isoWeek, weekStartFromIso, startOfWeek, zonedTime, hm, dayKey } from "./time";

const t = (hhmm: string) => new Date(`2026-09-24T${hhmm}:00Z`);
const open = { id: "r1", minor: 1, locationId: "hq", checkInAt: t("06:00") };

test("a pass while out checks in", () => {
  assert.deepEqual(decide(null, null, { type: "enter", minor: 1, locationId: "hq", at: t("06:00") }), { kind: "checkin", at: t("06:00") });
});
test("a check-in pass while already in (second phone, replay) changes nothing", () => {
  assert.equal(decide(open, null, { type: "enter", minor: 2, locationId: "ams", at: t("07:00") }).kind, "seen");
});
test("a check-out pass closes at the pass time, whichever company beacon", () => {
  assert.deepEqual(decide(open, null, { type: "exit", minor: 1, locationId: "hq", at: t("15:00") }), { kind: "checkout", regId: "r1", at: t("15:00") });
  assert.deepEqual(decide(open, null, { type: "exit", minor: 7, locationId: "ams", at: t("15:00") }), { kind: "checkout", regId: "r1", at: t("15:00") });
});
test("a check-out pass while out is ignored", () => {
  assert.deepEqual(decide(null, null, { type: "exit", minor: 1, locationId: "hq", at: t("15:00") }), { kind: "ignore", reason: "not_active" });
});
test("passes older than the current state are stale", () => {
  assert.deepEqual(decide(open, null, { type: "exit", minor: 1, locationId: "hq", at: t("05:00") }), { kind: "ignore", reason: "stale" });
  const closed = { id: "r1", locationId: "hq", checkOutAt: t("15:00"), status: "ok", source: "beacon" };
  assert.deepEqual(decide(null, closed, { type: "enter", minor: 1, locationId: "hq", at: t("14:00") }), { kind: "ignore", reason: "stale" });
  assert.equal(decide(null, closed, { type: "enter", minor: 1, locationId: "hq", at: t("15:20") }).kind, "checkin");
});
test("auto registrations count zero; open ones count to now", () => {
  assert.equal(countedMs({ checkInAt: t("06:00"), checkOutAt: t("08:00"), status: "auto" }, t("09:00")), 0);
  assert.equal(countedMs({ checkInAt: t("06:00"), checkOutAt: null, status: "open" }, t("09:00")), 3 * 3600_000);
});
test("sheet status", () => {
  assert.equal(sheetStatus([{ status: "ok" }], false), "ready");
  assert.equal(sheetStatus([{ status: "ok" }], true), "approved");
  assert.equal(sheetStatus([{ status: "auto" }], true), "review");
  assert.equal(sheetStatus([{ status: "pending" }], false), "review");
});
test("correction validation", () => {
  const same = (a: Date, b: Date) => dayKey(a) === dayKey(b);
  assert.equal(validateCorrection(t("08:00"), t("07:00"), same), "out_before_in");
  assert.equal(validateCorrection(t("04:00"), t("21:30"), same), "too_long");
  assert.equal(validateCorrection(t("06:00"), t("15:00"), same), null);
});
test("time: 23:59 local in Amsterdam (CEST) is 21:59Z", () => {
  assert.equal(autoCloseAt(t("06:00")).toISOString(), "2026-09-24T21:59:00.000Z");
  assert.equal(autoCloseAt(new Date("2026-12-10T08:00:00Z")).toISOString(), "2026-12-10T22:59:00.000Z");
});
test("time: DST boundary resolves correctly", () => {
  assert.equal(zonedTime(2026, 10, 25, 12, 0).toISOString(), "2026-10-25T11:00:00.000Z");
  assert.equal(zonedTime(2026, 3, 29, 12, 0).toISOString(), "2026-03-29T10:00:00.000Z");
});
test("time: iso weeks", () => {
  assert.equal(isoWeek(t("06:00")), "2026-W39");
  assert.equal(weekStartFromIso("2026-W39").toISOString(), "2026-09-20T22:00:00.000Z");
  assert.equal(startOfWeek(t("06:00")).toISOString(), "2026-09-20T22:00:00.000Z");
  assert.equal(isoWeek(new Date("2027-01-01T12:00:00Z")), "2026-W53");
  assert.equal(hm(t("05:58")), "07:58");
});
