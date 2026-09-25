import "server-only";
import type { Prisma, User } from "@prisma/client";
import { db } from "./db";
import { beaconHealth, companyCode, FIRST_MAJOR, requestRef, TIMO_UUID } from "./beacon";
import { bad, notFound, audit } from "./api";
import { issueMagicLink } from "./magic";

type Tx = Prisma.TransactionClient;

export async function nextMajor(tx: Tx | typeof db = db): Promise<number> {
  const max = await tx.company.aggregate({ _max: { major: true } });
  return Math.max(FIRST_MAJOR, (max._max.major ?? FIRST_MAJOR - 1) + 1);
}

/**
 * Next free minors for a major. Callers hold a row lock on the company (SELECT … FOR UPDATE) so two
 * programming runs can't hand out the same minors; the (major, minor) unique constraint is the backstop.
 */
async function nextMinors(tx: Tx, major: number, qty: number): Promise<number[]> {
  const max = await tx.beacon.aggregate({ where: { major }, _max: { minor: true } });
  const start = (max._max.minor ?? 0) + 1;
  if (start + qty - 1 > 65535) throw bad("minor_range", "This major has no free minors left.");
  return Array.from({ length: qty }, (_, i) => start + i);
}

export async function previewMinors(companyId: string, qty: number) {
  const c = await db.company.findUnique({ where: { id: companyId } });
  if (!c) throw notFound("Company");
  const max = await db.beacon.aggregate({ where: { major: c.major }, _max: { minor: true } });
  const start = (max._max.minor ?? 0) + 1;
  return { major: c.major, from: start, to: start + qty - 1 };
}

async function newSerial(tx: Tx): Promise<string> {
  const yy = String(new Date().getUTCFullYear()).slice(2);
  const last = await tx.beacon.findFirst({ where: { serial: { startsWith: `TB-${yy}-` } }, orderBy: { serial: "desc" } });
  const n = last ? parseInt(last.serial.slice(6), 10) + 1 : 1;
  return `TB-${yy}-${String(n).padStart(5, "0")}`;
}

/**
 * Program `qty` beacons for a company: take units from stock first (oldest first), register new serials for
 * the rest, write UUID + major + the next minors, and mark them shipped.
 */
async function program(tx: Tx, companyId: string, qty: number, requestId?: string) {
  const [company] = await tx.$queryRaw<{ id: string; major: number }[]>`SELECT id, major FROM "Company" WHERE id = ${companyId} FOR UPDATE`;
  if (!company) throw notFound("Company");
  const minors = await nextMinors(tx, company.major, qty);
  const stock = await tx.beacon.findMany({ where: { status: "stock", companyId: null }, orderBy: { createdAt: "asc" }, take: qty });
  const now = new Date();
  const out: { serial: string; minor: number }[] = [];
  for (let i = 0; i < qty; i++) {
    const data = { major: company.major, minor: minors[i], companyId, status: "shipped" as const, programmedAt: now, requestId: requestId ?? null, battery: 100 };
    if (stock[i]) {
      await tx.beacon.update({ where: { id: stock[i].id }, data });
      out.push({ serial: stock[i].serial, minor: minors[i] });
    } else {
      const serial = await newSerial(tx);
      await tx.beacon.create({ data: { serial, firmware: "1.4.2", ...data } });
      out.push({ serial, minor: minors[i] });
    }
  }
  return { major: company.major, minors, beacons: out };
}

export async function programBeacons(actor: User, companyId: string, qty: number) {
  const res = await db.$transaction((tx) => program(tx, companyId, qty), { timeout: 20_000 });
  await audit(companyId, actor.id, "beacon.program", "company", companyId, res);
  return res;
}

export async function registerCompany(actor: User, data: { name: string; adminEmail: string; adminName?: string; beacons: number; major?: number }) {
  const email = data.adminEmail.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.companyId) throw bad("email_taken", "This person already belongs to a company.", { adminEmail: "Already in a company." });
  const res = await db.$transaction(async (tx) => {
    const major = data.major ?? (await nextMajor(tx));
    if (major < 1 || major > 65535) throw bad("major", "A major is 1–65535.");
    if (await tx.company.findUnique({ where: { major } })) throw bad("major_taken", `Major ${major} is already assigned.`, { major: "Taken." });
    let code = companyCode(data.name, major);
    if (await tx.company.findUnique({ where: { code } })) code = `TM-${major}`;
    const company = await tx.company.create({ data: { name: data.name.trim(), major, code } });
    const adminName = data.adminName?.trim() || email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    await tx.user.upsert({
      where: { email },
      create: { email, name: adminName, companyId: company.id, role: "company_admin", status: "invited" },
      update: { companyId: company.id, role: "company_admin" },
    });
    const programmed = data.beacons > 0 ? await program(tx, company.id, data.beacons) : null;
    return { company, programmed };
  }, { timeout: 20_000 });
  await audit(res.company.id, actor.id, "company.register", "company", res.company.id, { major: res.company.major, beacons: data.beacons });
  const link = await issueMagicLink(email, "web", { invite: { companyName: res.company.name, code: res.company.code, inviter: "Timo" } });
  return { id: res.company.id, major: res.company.major, code: res.company.code, minors: res.programmed?.minors ?? [], devToken: link.devToken };
}

export async function stats() {
  const [companies, majors, inField, stock, openReq] = await Promise.all([
    db.company.count(),
    db.company.aggregate({ _min: { major: true }, _max: { major: true } }),
    db.beacon.count({ where: { status: { in: ["active", "supplied", "shipped"] } } }),
    db.beacon.count({ where: { status: "stock" } }),
    db.beaconRequest.count({ where: { status: "requested" } }),
  ]);
  return { uuid: TIMO_UUID, companies, majorFrom: majors._min.major, majorTo: majors._max.major, inField, stock, openRequests: openReq, nextMajor: await nextMajor() };
}

export async function companies() {
  const list = await db.company.findMany({
    orderBy: { major: "asc" },
    include: {
      _count: { select: { locations: true, users: true } },
      beacons: { include: { location: { select: { name: true } } }, orderBy: { minor: "asc" } },
      users: { where: { role: "company_admin" }, take: 1, orderBy: { createdAt: "asc" }, select: { email: true, name: true } },
    },
  });
  return list.map((c) => ({
    id: c.id, major: c.major, name: c.name, code: c.code, status: c.status, adminEmail: c.users[0]?.email ?? null, createdAt: c.createdAt.toISOString(),
    locations: c._count.locations, users: c._count.users,
    beaconsActive: c.beacons.filter((b) => b.status === "active").length, beaconsTotal: c.beacons.length,
    awayMinutes: c.awayMinutes, passLockMinutes: c.passLockMinutes, ssoDomains: c.ssoDomains, ssoIssuer: c.ssoIssuer, ssoClientId: c.ssoClientId, ssoConfigured: !!(c.ssoIssuer && c.ssoClientId),
    minors: c.beacons.map((b) => ({ minor: b.minor, serial: b.serial, placedAt: b.location ? `${b.location.name}${b.spot ? ` · ${b.spot}` : ""}` : null, status: b.status, health: b.status === "active" ? beaconHealth(b) : null })),
  }));
}

export async function updateCompany(actor: User, id: string, data: { name?: string; status?: "onboarding" | "active"; awayMinutes?: number; passLockMinutes?: number; ssoDomains?: string | null; ssoIssuer?: string | null; ssoClientId?: string | null; ssoClientSecret?: string | null }) {
  const c = await db.company.update({ where: { id }, data });
  await audit(id, actor.id, "company.update", "company", id, { ...data, ssoClientSecret: data.ssoClientSecret ? "•••" : undefined });
  return c;
}

export async function inventory(status?: string) {
  const where: Prisma.BeaconWhereInput = status && status !== "all" ? { status: status as never } : {};
  const [list, counts] = await Promise.all([
    db.beacon.findMany({ where, include: { company: { select: { name: true } }, location: { select: { name: true } } }, orderBy: [{ major: "asc" }, { minor: "asc" }, { serial: "asc" }] }),
    db.beacon.groupBy({ by: ["status"], _count: true }),
  ]);
  const c = Object.fromEntries(counts.map((x) => [x.status, x._count]));
  return {
    uuid: TIMO_UUID,
    counts: { all: counts.reduce((a, x) => a + x._count, 0), active: c.active ?? 0, supplied: c.supplied ?? 0, shipped: c.shipped ?? 0, stock: c.stock ?? 0 },
    beacons: list.map((b) => ({
      id: b.id, serial: b.serial, major: b.major, minor: b.minor, company: b.company?.name ?? null,
      placedAt: b.location ? `${b.location.name}${b.spot ? ` · ${b.spot}` : ""}` : null, firmware: b.firmware, battery: b.battery, status: b.status,
      health: b.status === "active" ? beaconHealth(b) : null,
    })),
  };
}

/** Register blank units into stock (serials from the manufacturer, or generated). */
export async function addStock(actor: User, qty: number, serials?: string[]) {
  const made: string[] = [];
  await db.$transaction(async (tx) => {
    const list = serials?.length ? serials : [];
    for (let i = 0; i < (list.length || qty); i++) {
      const serial = list[i]?.trim() || (await newSerial(tx));
      await tx.beacon.create({ data: { serial, status: "stock", firmware: "1.4.2", battery: 100 } });
      made.push(serial);
    }
  });
  await audit(null, actor.id, "beacon.stock", "beacon", null, { serials: made });
  return { serials: made };
}

/** A shipped beacon (or a whole request) arrived at the customer: shipped → supplied. */
export async function markDelivered(actor: User, beaconIds: string[]) {
  await db.beacon.updateMany({ where: { id: { in: beaconIds }, status: "shipped" }, data: { status: "supplied", deliveredAt: new Date() } });
}

export async function requests() {
  const list = await db.beaconRequest.findMany({
    include: { company: { select: { name: true, major: true } }, location: { select: { name: true } }, requestedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const out = [];
  for (const r of list) {
    const preview = r.status === "requested" ? await previewMinors(r.companyId, r.quantity) : null;
    out.push({
      id: r.id, ref: requestRef(r.number), createdAt: r.createdAt.toISOString(), company: r.company.name, major: r.company.major,
      location: r.location?.name ?? null, requestedBy: r.requestedBy?.name ?? null, quantity: r.quantity, note: r.note, status: r.status,
      assignedMinors: r.assignedMinors, nextMinors: preview ? { from: preview.from, to: preview.to } : null,
    });
  }
  return out;
}

export async function fulfilRequest(actor: User, id: string) {
  const r = await db.beaconRequest.findUnique({ where: { id } });
  if (!r) throw notFound("Request");
  if (r.status !== "requested") throw bad("handled", "This request was already handled.");
  const res = await db.$transaction(async (tx) => {
    const p = await program(tx, r.companyId, r.quantity, r.id);
    await tx.beaconRequest.update({ where: { id }, data: { status: "shipped", shippedAt: new Date(), assignedMinors: p.minors } });
    return p;
  }, { timeout: 20_000 });
  await audit(r.companyId, actor.id, "beacon_request.fulfil", "beacon_request", id, res);
  return res;
}

export async function deliverRequest(actor: User, id: string) {
  const r = await db.beaconRequest.findUnique({ where: { id } });
  if (!r) throw notFound("Request");
  await db.$transaction([
    db.beaconRequest.update({ where: { id }, data: { status: "delivered", deliveredAt: new Date() } }),
    db.beacon.updateMany({ where: { requestId: id, status: "shipped" }, data: { status: "supplied", deliveredAt: new Date() } }),
  ]);
  await audit(r.companyId, actor.id, "beacon_request.deliver", "beacon_request", id);
}
