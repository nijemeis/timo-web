import "server-only";
import type { Prisma, Registration } from "@prisma/client";
import { db } from "./db";
import { countedMs } from "./engine";
import { autoCloseAt, DEFAULT_TZ, startOfDay, startOfWeek } from "./time";
import type { RegistrationDTO } from "./types";

export const regInclude = {
  location: { select: { id: true, name: true, timezone: true } },
  company: { select: { major: true, timezone: true } },
  corrections: { orderBy: { createdAt: "desc" as const }, take: 1 },
} satisfies Prisma.RegistrationInclude;

export type RegWithRefs = Prisma.RegistrationGetPayload<{ include: typeof regInclude }>;

export function toDTO(r: RegWithRefs, now = new Date()): RegistrationDTO {
  const c = r.corrections[0];
  return {
    id: r.id,
    checkInAt: r.checkInAt.toISOString(),
    checkOutAt: r.checkOutAt?.toISOString() ?? null,
    status: r.status,
    source: r.source,
    major: r.minor != null ? r.company.major : null,
    minor: r.minor,
    locationId: r.locationId,
    location: r.location?.name ?? null,
    spot: r.spot,
    timezone: r.location?.timezone ?? r.company.timezone ?? DEFAULT_TZ,
    countedMs: countedMs(r, now),
    originalInAt: r.originalInAt?.toISOString() ?? null,
    originalOutAt: r.originalOutAt?.toISOString() ?? null,
    correction: c
      ? { id: c.id, status: c.status, type: c.type, requestedIn: c.requestedIn.toISOString(), requestedOut: c.requestedOut.toISOString(), note: c.note }
      : null,
  };
}

/**
 * Close every open registration whose local day has ended: checkOutAt = 23:59 that day, status `auto`.
 * Runs on a timer (instrumentation.ts) and before reads, so nothing depends on the timer being alive.
 */
export async function sweepAutoClose(now = new Date(), where: Prisma.RegistrationWhereInput = {}): Promise<number> {
  const open = await db.registration.findMany({
    where: { ...where, status: "open", checkInAt: { lt: new Date(now.getTime() - 3600_000) } },
    include: { location: { select: { timezone: true } }, company: { select: { timezone: true } } },
  });
  let n = 0;
  for (const r of open) {
    const tz = r.location?.timezone ?? r.company.timezone;
    if (startOfDay(now, tz) <= r.checkInAt) continue; // still the same local day
    const at = autoCloseAt(r.checkInAt, tz);
    const done = await db.registration.updateMany({ where: { id: r.id, status: "open" }, data: { status: "auto", checkOutAt: at, originalOutAt: at } });
    n += done.count;
  }
  return n;
}

export async function openRegistration(userId: string): Promise<RegWithRefs | null> {
  return db.registration.findFirst({ where: { userId, status: "open" }, include: regInclude, orderBy: { checkInAt: "desc" } });
}

export async function userSummary(userId: string, contractHours: number, tz: string) {
  await sweepAutoClose(new Date(), { userId });
  const now = new Date();
  const weekStart = startOfWeek(now, tz);
  const dayStart = startOfDay(now, tz);
  const regs = await db.registration.findMany({ where: { userId, checkInAt: { gte: weekStart } }, include: regInclude, orderBy: { checkInAt: "desc" } });
  const dtos = regs.map((r) => toDTO(r, now));
  const today = dtos.filter((r) => new Date(r.checkInAt) >= dayStart);
  const open = dtos.find((r) => r.status === "open") ?? (await openRegistration(userId).then((r) => (r ? toDTO(r, now) : null)));
  return {
    now: now.toISOString(),
    open,
    today,
    todayMs: today.reduce((a, r) => a + r.countedMs, 0),
    weekMs: dtos.reduce((a, r) => a + r.countedMs, 0),
    contractHours,
  };
}

export async function userRegistrations(userId: string, opts: { from?: Date; to?: Date; locationId?: string; attention?: boolean }) {
  await sweepAutoClose(new Date(), { userId });
  const now = new Date();
  const where: Prisma.RegistrationWhereInput = { userId };
  if (opts.from || opts.to) where.checkInAt = { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lt: opts.to } : {}) };
  if (opts.locationId) where.locationId = opts.locationId;
  if (opts.attention) where.status = { in: ["auto", "pending"] };
  const regs = await db.registration.findMany({ where, include: regInclude, orderBy: { checkInAt: "desc" }, take: 500 });
  const items = regs.map((r) => toDTO(r, now));
  return { items, totalMs: items.reduce((a, r) => a + r.countedMs, 0) };
}

export type { Registration };
