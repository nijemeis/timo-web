/**
 * Integration check of the pass-the-gate event pipeline against the local database: a throwaway user gets a
 * late check-out pass after an auto check-out, passes in and out on different beacons, sends a second
 * check-in pass, and a duplicate upload. Run: npx tsx --conditions react-server scripts/smoke-events.ts
 */
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { ingestEvents } from "../src/lib/events";
import { sweepAutoClose } from "../src/lib/registrations";
import { TIMO_UUID } from "../src/lib/beacon";

async function main() {
  const np = await db.company.findUniqueOrThrow({ where: { major: 1042 } });
  const email = `smoke-${Date.now()}@northpier.example`;
  const user = await db.user.create({ data: { email, name: "Smoke Test", companyId: np.id, status: "active" } });
  const dev = await db.device.create({ data: { userId: user.id, installId: "smoke", platform: "ios" } });
  const ev = (seq: number, type: "enter" | "exit", minor: number, at: string) => ({ seq, type, uuid: TIMO_UUID, major: 1042, minor, at });
  // Second part runs "today" (relative to now) so the real-clock auto-close sweep leaves it alone.
  const base = Date.now() - 10 * 3600_000;
  const T = (min: number) => new Date(base + min * 60_000).toISOString();
  const regs = () => db.registration.findMany({ where: { userId: user.id }, orderBy: { checkInAt: "asc" } });
  try {
    // Two days ago: in at HQ 07:58, never left → auto at 23:59; the phone's exit arrives late.
    const r = await ingestEvents(user, dev.id, [ev(1, "enter", 1, new Date(Date.now() - 3 * 86400_000).toISOString())]);
    assert.equal(r.open?.minor, 1);
    await sweepAutoClose(new Date(), { userId: user.id });
    assert.equal((await regs())[0].status, "auto");
    await ingestEvents(user, dev.id, [ev(2, "exit", 1, new Date(Date.now() - 3 * 86400_000 + 8 * 3600_000).toISOString())]);
    assert.equal((await regs())[0].status, "ok", "late exit resolves the auto check-out");

    // Today, pass-the-gate: in at HQ, out at Amsterdam (any company beacon closes), in again, second check-in pass ignored.
    await ingestEvents(user, dev.id, [ev(3, "enter", 1, T(0)), ev(4, "exit", 7, T(480))]);
    let list = await regs();
    assert.equal(list.length, 2);
    assert.equal(list[1].status, "ok");
    assert.equal(list[1].checkOutAt?.toISOString(), T(480));
    let r2 = await ingestEvents(user, dev.id, [ev(5, "enter", 2, T(500)), ev(6, "enter", 3, T(501))]);
    assert.equal(r2.open?.minor, 2, "a second check-in pass keeps the first registration");
    // Duplicate upload + a foreign major + an unknown minor are harmless.
    r2 = await ingestEvents(user, dev.id, [ev(6, "enter", 3, T(501)), { ...ev(7, "enter", 1, T(502)), major: 999 }, ev(8, "enter", 4242, T(503))]);
    assert.equal(r2.duplicates, 1);
    assert.equal(r2.ackSeq, 8);
    const outcomes = (await db.beaconEvent.findMany({ where: { deviceId: dev.id }, orderBy: { seq: "asc" } })).map((e) => `${e.seq}:${e.outcome}`);
    assert.deepEqual(outcomes, ["1:checkin", "2:checkout:late", "3:checkin", "4:checkout", "5:checkin", "6:seen", "7:ignored:foreign", "8:ignored:unknown_beacon"]);
    await ingestEvents(user, dev.id, [ev(9, "exit", 1, T(560))]);
    list = await regs();
    assert.equal(list.length, 3);
    assert.equal(list.every((x) => x.status === "ok"), true);
    console.log("✔ event pipeline smoke test passed");
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
