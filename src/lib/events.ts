import "server-only";
import type { Prisma, User } from "@prisma/client";
import { db } from "./db";
import { decide } from "./engine";
import { TIMO_UUID } from "./beacon";
import { openRegistration, sweepAutoClose, toDTO } from "./registrations";
import type { BeaconEventIn, EventsResponse } from "./types";

type Tx = Prisma.TransactionClient;

/**
 * Store a batch of phone events (idempotent on deviceId + seq) and run each new one through the engine, in
 * time order, under a per-user advisory lock so two uploads can't interleave.
 */
export async function ingestEvents(user: User, deviceId: string, events: BeaconEventIn[]): Promise<EventsResponse> {
  const device = await db.device.findFirst({ where: { id: deviceId, userId: user.id } });
  if (!device) throw Object.assign(new Error("unknown device"), { code: "unknown_device" });
  await sweepAutoClose(new Date(), { userId: user.id });

  const company = user.companyId ? await db.company.findUnique({ where: { id: user.companyId } }) : null;
  const beacons = company
    ? await db.beacon.findMany({ where: { companyId: company.id, major: company.major, status: "active" }, select: { id: true, minor: true, locationId: true, spot: true } })
    : [];
  const byMinor = new Map(beacons.map((b) => [b.minor!, b]));
  const graceMs = (company?.graceMinutes ?? 3) * 60_000;

  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.seq - b.seq);
  let accepted = 0;
  let duplicates = 0;

  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
      const known = new Set(
        (await tx.beaconEvent.findMany({ where: { deviceId, seq: { in: sorted.map((e) => e.seq) } }, select: { seq: true } })).map((e) => e.seq),
      );
      for (const ev of sorted) {
        if (known.has(ev.seq)) { duplicates++; continue; }
        known.add(ev.seq);
        const at = new Date(ev.at);
        let outcome: string;
        const beacon = byMinor.get(ev.minor);
        if (!company || ev.uuid.toUpperCase() !== TIMO_UUID || ev.major !== company.major) outcome = "ignored:foreign";
        else if (!beacon) outcome = "ignored:unknown_beacon";
        else outcome = await apply(tx, user, company.id, beacon, ev.type, ev.minor, at, graceMs);

        await tx.beaconEvent.create({
          data: { userId: user.id, deviceId, uuid: ev.uuid.toUpperCase(), major: ev.major, minor: ev.minor, type: ev.type, at, rssi: ev.rssi ?? null, seq: ev.seq, outcome },
        });
        if (beacon && !outcome.startsWith("ignored:foreign")) {
          await tx.beacon.updateMany({ where: { id: beacon.id, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: at } }] }, data: { lastSeenAt: at } });
        }
        accepted++;
      }
    },
    { timeout: 20_000 },
  );

  await db.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });
  await db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date(), status: "active" } });
  const ack = await db.beaconEvent.aggregate({ where: { deviceId }, _max: { seq: true } });
  const open = await openRegistration(user.id);
  return { accepted, duplicates, ackSeq: ack._max.seq ?? 0, open: open ? toDTO(open) : null };
}

async function apply(
  tx: Tx,
  user: User,
  companyId: string,
  beacon: { id: string; minor: number | null; locationId: string | null; spot: string | null },
  type: "enter" | "exit",
  minor: number,
  at: Date,
  graceMs: number,
): Promise<string> {
  const open = await tx.registration.findFirst({ where: { userId: user.id, status: "open" }, orderBy: { checkInAt: "desc" } });
  const lastClosed = open ? null : await tx.registration.findFirst({ where: { userId: user.id, checkOutAt: { not: null } }, orderBy: { checkOutAt: "desc" } });

  // A late exit for a day that was already auto-closed at 23:59 (phone was offline): it resolves that registration.
  if (type === "exit" && !open && lastClosed?.status === "auto" && lastClosed.minor === minor && at >= lastClosed.checkInAt && at <= lastClosed.checkOutAt!) {
    await tx.registration.update({ where: { id: lastClosed.id }, data: { status: "ok", checkOutAt: at, originalOutAt: at } });
    return "checkout:late";
  }

  const d = decide(
    open ? { id: open.id, minor: open.minor, locationId: open.locationId, checkInAt: open.checkInAt } : null,
    lastClosed ? { id: lastClosed.id, locationId: lastClosed.locationId, checkOutAt: lastClosed.checkOutAt!, status: lastClosed.status, source: lastClosed.source } : null,
    { type, minor, locationId: beacon.locationId, at },
    graceMs,
  );
  const openData = {
    userId: user.id, companyId, beaconId: beacon.id, minor, locationId: beacon.locationId, spot: beacon.spot,
    checkInAt: at, lastSeenAt: at, originalInAt: at, status: "open" as const, source: "beacon" as const,
  };
  switch (d.kind) {
    case "ignore":
      return `ignored:${d.reason}`;
    case "seen":
      await tx.registration.update({ where: { id: d.regId }, data: { lastSeenAt: at } });
      return "seen";
    case "checkin":
      await tx.registration.create({ data: openData });
      return "checkin";
    case "checkout":
      await tx.registration.update({ where: { id: d.regId }, data: { checkOutAt: at, originalOutAt: at, status: "ok" } });
      return "checkout";
    case "switch":
      await tx.registration.update({ where: { id: d.closeId }, data: { checkOutAt: at, originalOutAt: at, status: "ok" } });
      await tx.registration.create({ data: openData });
      return "switch";
    case "reopen":
      await tx.registration.update({ where: { id: d.regId }, data: { checkOutAt: null, originalOutAt: null, status: "open", lastSeenAt: at } });
      return "reopen";
  }
}
