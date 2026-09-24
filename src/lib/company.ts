import "server-only";
import type { Prisma, User } from "@prisma/client";
import { db } from "./db";
import { countedMs, sheetStatus } from "./engine";
import { beaconHealth, requestRef, TIMO_UUID } from "./beacon";
import { addDays, dayKey, hm, isoWeek, localParts, startOfDay, weekStartFromIso, zonedTime } from "./time";
import { sweepAutoClose } from "./registrations";
import { bad, notFound, teamScope, audit } from "./api";

type Staff = User & { companyId: string };

export async function companyOf(user: Staff) {
  const c = await db.company.findUnique({ where: { id: user.companyId }, include: { locations: { orderBy: { createdAt: "asc" } } } });
  if (!c) throw notFound("Company");
  return c;
}

/* ───────────────────────────── Presence ───────────────────────────── */

export async function presence(user: Staff) {
  const company = await companyOf(user);
  const tz = company.timezone;
  await sweepAutoClose(new Date(), { companyId: company.id });
  const now = new Date();
  const day0 = startOfDay(now, tz);
  const scope = teamScope(user);

  const people = await db.user.findMany({ where: { companyId: company.id, status: "active", role: { not: "system_admin" }, ...scope }, select: { id: true, name: true, team: true } });
  const ids = people.map((p) => p.id);
  const open = await db.registration.findMany({
    where: { companyId: company.id, status: "open", userId: { in: ids } },
    include: { user: { select: { name: true, team: true } }, location: { select: { name: true } } },
    orderBy: { checkInAt: "asc" },
  });
  const todays = await db.registration.findMany({ where: { companyId: company.id, checkInAt: { gte: day0 } }, select: { userId: true, locationId: true, checkInAt: true, checkOutAt: true } });

  // "Expected, not in": active people who were in on the same weekday last week but not today, with their usual start.
  const lastWeekDay0 = addDays(day0, -7, tz);
  const lastWeek = await db.registration.findMany({ where: { companyId: company.id, userId: { in: ids }, checkInAt: { gte: lastWeekDay0, lt: addDays(lastWeekDay0, 1, tz) } }, select: { userId: true, checkInAt: true }, orderBy: { checkInAt: "asc" } });
  const inToday = new Set(todays.map((r) => r.userId));
  const usual = new Map<string, Date>();
  for (const r of lastWeek) if (!usual.has(r.userId)) usual.set(r.userId, r.checkInAt);
  const expected = people
    .filter((p) => usual.has(p.id) && !inToday.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, usualIn: hm(usual.get(p.id)!, tz) }));

  const beacons = await db.beacon.findMany({ where: { companyId: company.id, status: "active" }, select: { minor: true, locationId: true } });
  const locations = company.locations.map((l) => {
    const inNow = open.filter((r) => r.locationId === l.id).length;
    // Peak today: walk the day's check-ins/outs at this location in time order.
    const edges = todays
      .filter((r) => r.locationId === l.id)
      .flatMap((r) => [{ t: r.checkInAt.getTime(), d: 1 }, ...(r.checkOutAt ? [{ t: r.checkOutAt.getTime(), d: -1 }] : [])])
      .sort((a, b) => a.t - b.t || a.d - b.d);
    let cur = 0, peak = 0, peakAt: number | null = null;
    for (const e of edges) { cur += e.d; if (cur > peak) { peak = cur; peakAt = e.t; } }
    return {
      id: l.id, name: l.name, short: l.short, capacity: l.capacity, inNow,
      minors: beacons.filter((b) => b.locationId === l.id).map((b) => b.minor!).sort((a, b) => a - b),
      peak, peakAt: peakAt ? hm(new Date(peakAt), l.timezone) : null,
    };
  });

  const events = await db.beaconEvent.findMany({
    where: { user: { companyId: company.id, ...scope }, outcome: { in: ["checkin", "checkout", "switch", "checkout:late"] } },
    orderBy: { at: "desc" },
    take: 25,
    include: { user: { select: { name: true } } },
  });
  const beaconByMinor = new Map((await db.beacon.findMany({ where: { companyId: company.id }, include: { location: { select: { name: true } } } })).map((b) => [b.minor, b]));

  return {
    now: now.toISOString(),
    company: { name: company.name, major: company.major, locations: company.locations.length },
    kpi: {
      inNow: open.length,
      active: people.length,
      split: locations.map((l) => ({ short: l.short ?? l.name, n: l.inNow })),
      expected,
      attention: await attentionCount(user),
    },
    locations,
    checkedIn: open.map((r) => ({ id: r.id, userId: r.userId, name: r.user.name, team: r.user.team, locationId: r.locationId, location: r.location?.name ?? "—", spot: r.spot, since: r.checkInAt.toISOString() })),
    events: events.map((e) => {
      const b = beaconByMinor.get(e.minor);
      return { id: e.id, at: e.at.toISOString(), type: e.type, name: e.user.name, location: b?.location?.name ?? "—", spot: b?.spot ?? "", minor: e.minor };
    }),
  };
}

/* ───────────────────────────── Timesheets ───────────────────────────── */

export async function timesheets(user: Staff, week?: string, team?: string) {
  const company = await companyOf(user);
  const tz = company.timezone;
  await sweepAutoClose(new Date(), { companyId: company.id });
  const now = new Date();
  const label = week || isoWeek(now, tz);
  const from = weekStartFromIso(label, tz);
  const to = addDays(from, 7, tz);
  const scope = teamScope(user);
  const people = await db.user.findMany({
    where: { companyId: company.id, status: "active", role: { not: "system_admin" }, ...scope, ...(team ? { team } : {}) },
    orderBy: { name: "asc" },
  });
  const regs = await db.registration.findMany({
    where: { companyId: company.id, userId: { in: people.map((p) => p.id) }, checkInAt: { gte: from, lt: to } },
    include: { location: { select: { name: true } } },
    orderBy: { checkInAt: "asc" },
  });
  const approvals = await db.timesheetApproval.findMany({ where: { weekIso: label, userId: { in: people.map((p) => p.id) } } });
  const approved = new Set(approvals.map((a) => a.userId));
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(from, i, tz), tz));
  const todayKey = dayKey(now, tz);
  const teams = [...new Set((await db.user.findMany({ where: { companyId: company.id, team: { not: null }, ...scope }, select: { team: true } })).map((u) => u.team!))].sort();

  const rows = people.map((p) => {
    const mine = regs.filter((r) => r.userId === p.id);
    const perDay = days.map((k) => {
      const list = mine.filter((r) => dayKey(r.checkInAt, tz) === k);
      return {
        day: k,
        ms: list.reduce((a, r) => a + countedMs(r, now), 0),
        auto: list.some((r) => r.status === "auto"),
        regs: list.map((r) => ({ id: r.id, in: r.checkInAt.toISOString(), out: r.checkOutAt?.toISOString() ?? null, status: r.status, location: r.location?.name ?? "—", spot: r.spot })),
      };
    });
    const totalMs = perDay.reduce((a, d) => a + d.ms, 0);
    return {
      userId: p.id, name: p.name, team: p.team, contractHours: p.contractHours,
      days: perDay, totalMs, deltaMs: totalMs - p.contractHours * 3600_000,
      status: sheetStatus(mine, approved.has(p.id)),
    };
  });
  const prev = isoWeek(addDays(from, -3, tz), tz), next = isoWeek(addDays(from, 10, tz), tz);
  return { week: label, from: from.toISOString(), to: to.toISOString(), days, today: todayKey, prev, next, teams, rows };
}

export async function approveTimesheets(user: Staff, week: string, userIds: string[]) {
  const sheet = await timesheets(user, week);
  const ready = sheet.rows.filter((r) => r.status === "ready" && userIds.includes(r.userId));
  for (const r of ready) {
    await db.timesheetApproval.upsert({ where: { userId_weekIso: { userId: r.userId, weekIso: week } }, create: { userId: r.userId, weekIso: week, approvedById: user.id }, update: {} });
  }
  await audit(user.companyId, user.id, "timesheet.approve", "timesheet", week, { userIds: ready.map((r) => r.userId) });
  return { approved: ready.length };
}

/* ───────────────────────────── Needs attention ───────────────────────────── */

async function attentionCount(user: Staff) {
  const scope = teamScope(user);
  const [auto, pending] = await Promise.all([
    db.registration.count({ where: { companyId: user.companyId, status: "auto", user: scope } }),
    db.correctionRequest.count({ where: { status: "pending", user: { companyId: user.companyId, ...scope } } }),
  ]);
  return auto + pending;
}

export async function attention(user: Staff) {
  const company = await companyOf(user);
  await sweepAutoClose(new Date(), { companyId: company.id });
  const scope = teamScope(user);
  const missing = await db.registration.findMany({
    where: { companyId: company.id, status: "auto", user: scope },
    include: { user: { select: { name: true, team: true } }, location: { select: { name: true, timezone: true } } },
    orderBy: { checkInAt: "desc" },
  });
  const corrections = await db.correctionRequest.findMany({
    where: { status: "pending", user: { companyId: company.id, ...scope } },
    include: { user: { select: { name: true, team: true } }, registration: { include: { location: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const locs = new Map(company.locations.map((l) => [l.id, l.name]));
  return {
    missing: missing.map((r) => ({
      id: r.id, name: r.user.name, team: r.user.team, day: r.checkInAt.toISOString(), location: r.location?.name ?? "—", spot: r.spot,
      checkInAt: r.checkInAt.toISOString(), checkOutAt: r.checkOutAt?.toISOString() ?? null, timezone: r.location?.timezone ?? company.timezone,
    })),
    corrections: corrections.map((c) => ({
      id: c.id, name: c.user.name, team: c.user.team, type: c.type, note: c.note,
      location: c.registration?.location?.name ?? (c.locationId ? locs.get(c.locationId) : null) ?? "—",
      recordedIn: c.registration?.checkInAt.toISOString() ?? null,
      recordedOut: c.registration?.checkOutAt?.toISOString() ?? null,
      recordedStatus: c.priorStatus,
      requestedIn: c.requestedIn.toISOString(), requestedOut: c.requestedOut.toISOString(),
      createdAt: c.createdAt.toISOString(), timezone: company.timezone,
    })),
  };
}

async function staffCanTouch(user: Staff, userId: string) {
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.companyId !== user.companyId) throw notFound("Employee");
  if (user.role === "manager" && user.team && target.team !== user.team) throw notFound("Employee");
  return target;
}

/** Admin sets the missing check-out of an auto registration. */
export async function setCheckout(user: Staff, regId: string, checkOutAt: Date) {
  const reg = await db.registration.findUnique({ where: { id: regId } });
  if (!reg || reg.companyId !== user.companyId) throw notFound("Registration");
  await staffCanTouch(user, reg.userId);
  if (checkOutAt <= reg.checkInAt) throw bad("out_before_in", "Check-out must be after check-in.");
  if (checkOutAt.getTime() - reg.checkInAt.getTime() > 16 * 3600_000) throw bad("too_long", "A registration can be at most 16 hours.");
  await db.registration.update({ where: { id: reg.id }, data: { checkOutAt, status: "ok", source: "admin" } });
  await audit(user.companyId, user.id, "registration.set_checkout", "registration", reg.id, { from: reg.checkOutAt, to: checkOutAt });
}

export async function decideCorrection(user: Staff, id: string, approve: boolean) {
  const c = await db.correctionRequest.findUnique({ where: { id }, include: { user: true, registration: true } });
  if (!c || c.user.companyId !== user.companyId) throw notFound("Correction");
  await staffCanTouch(user, c.userId);
  if (c.status !== "pending") throw bad("already_decided", "This correction was already handled.");
  await db.$transaction(async (tx) => {
    await tx.correctionRequest.update({ where: { id }, data: { status: approve ? "approved" : "declined", decidedById: user.id, decidedAt: new Date() } });
    if (c.registration) {
      await tx.registration.update({
        where: { id: c.registration.id },
        data: approve
          ? { checkInAt: c.requestedIn, checkOutAt: c.requestedOut, status: "ok", source: "manual_correction" }
          : { status: c.priorStatus ?? "ok" },
      });
    } else if (approve) {
      await tx.registration.create({
        data: { userId: c.userId, companyId: user.companyId, locationId: c.locationId, checkInAt: c.requestedIn, checkOutAt: c.requestedOut, status: "ok", source: "manual_correction" },
      });
    }
  });
  await audit(user.companyId, user.id, approve ? "correction.approve" : "correction.decline", "correction", id, {
    registrationId: c.registrationId, requestedIn: c.requestedIn, requestedOut: c.requestedOut,
    recordedIn: c.registration?.checkInAt, recordedOut: c.registration?.checkOutAt,
  });
}

/* ───────────────────────────── Locations & beacons ───────────────────────────── */

export async function beaconsOverview(user: Staff) {
  const company = await companyOf(user);
  const day0 = startOfDay(new Date(), company.timezone);
  const beacons = await db.beacon.findMany({ where: { companyId: company.id }, include: { location: true }, orderBy: { minor: "asc" } });
  const counts = await db.beaconEvent.groupBy({ by: ["minor"], where: { major: company.major, at: { gte: day0 } }, _count: true });
  const byMinor = new Map(counts.map((c) => [c.minor, c._count]));
  const requests = await db.beaconRequest.findMany({ where: { companyId: company.id }, include: { location: true, requestedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
  return {
    uuid: TIMO_UUID,
    major: company.major,
    minors: beacons.map((b) => b.minor!).filter((m) => m != null),
    locations: company.locations.map((l) => ({ id: l.id, name: l.name, short: l.short, capacity: l.capacity, timezone: l.timezone })),
    active: beacons.filter((b) => b.status === "active").map((b) => ({
      id: b.id, serial: b.serial, minor: b.minor, location: b.location?.name ?? "—", locationId: b.locationId, spot: b.spot, placement: b.placement,
      battery: b.battery, lastSeenAt: b.lastSeenAt?.toISOString() ?? null, eventsToday: byMinor.get(b.minor!) ?? 0, health: beaconHealth(b),
    })),
    supplied: beacons.filter((b) => b.status === "supplied" || b.status === "shipped").map((b) => ({ id: b.id, serial: b.serial, minor: b.minor, status: b.status })),
    requests: requests.map((r) => ({
      id: r.id, ref: requestRef(r.number), quantity: r.quantity, location: r.location?.name ?? null, note: r.note,
      status: r.status, assignedMinors: r.assignedMinors, createdAt: r.createdAt.toISOString(), requestedBy: r.requestedBy?.name ?? null,
    })),
  };
}

/** Link a supplied beacon to a location + spot. Shipped ones may be activated too: arrival is implied. */
export async function activateBeacon(user: Staff, id: string, data: { locationId: string; spot: string; placement: "entrance" | "zone" }) {
  const b = await db.beacon.findUnique({ where: { id } });
  if (!b || b.companyId !== user.companyId) throw notFound("Beacon");
  const loc = await db.location.findUnique({ where: { id: data.locationId } });
  if (!loc || loc.companyId !== user.companyId) throw bad("location", "Pick one of your locations.", { locationId: "Pick a location." });
  const updated = await db.beacon.update({
    where: { id },
    data: { locationId: loc.id, spot: data.spot.trim(), placement: data.placement, status: "active", activatedAt: b.activatedAt ?? new Date(), deliveredAt: b.deliveredAt ?? new Date() },
  });
  await db.company.update({ where: { id: user.companyId }, data: { status: "active" } });
  await audit(user.companyId, user.id, "beacon.activate", "beacon", id, { minor: b.minor, location: loc.name, spot: data.spot, placement: data.placement });
  return updated;
}

export async function requestBeacons(user: Staff, data: { quantity: number; locationId?: string | null; note?: string | null }) {
  if (data.locationId) {
    const loc = await db.location.findUnique({ where: { id: data.locationId } });
    if (!loc || loc.companyId !== user.companyId) throw bad("location", "Pick one of your locations.");
  }
  const r = await db.beaconRequest.create({ data: { companyId: user.companyId, quantity: data.quantity, locationId: data.locationId || null, note: data.note || null, requestedById: user.id } });
  await audit(user.companyId, user.id, "beacon_request.create", "beacon_request", r.id, data);
  return { id: r.id, ref: requestRef(r.number) };
}

export async function upsertLocation(user: Staff, data: { id?: string; name: string; short?: string | null; capacity: number; timezone?: string }) {
  if (data.id) {
    const l = await db.location.findUnique({ where: { id: data.id } });
    if (!l || l.companyId !== user.companyId) throw notFound("Location");
    return db.location.update({ where: { id: l.id }, data: { name: data.name, short: data.short ?? null, capacity: data.capacity, ...(data.timezone ? { timezone: data.timezone } : {}) } });
  }
  const company = await companyOf(user);
  return db.location.create({ data: { companyId: user.companyId, name: data.name, short: data.short ?? null, capacity: data.capacity, timezone: data.timezone || company.timezone } });
}

/* ───────────────────────────── People ───────────────────────────── */

export async function people(user: Staff) {
  const company = await companyOf(user);
  const scope = teamScope(user);
  const list = await db.user.findMany({
    where: { companyId: company.id, role: { not: "system_admin" }, ...scope },
    include: { devices: { orderBy: { lastSeenAt: "desc" }, take: 1 } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const inNow = new Set((await db.registration.findMany({ where: { companyId: company.id, status: "open" }, select: { userId: true } })).map((r) => r.userId));
  const teams = [...new Set(list.map((u) => u.team).filter(Boolean) as string[])].sort();
  return {
    code: company.code,
    teams,
    people: list.map((u) => ({
      id: u.id, name: u.name, email: u.email, team: u.team, role: u.role, contractHours: u.contractHours,
      device: u.devices[0] ? `${u.devices[0].platform === "ios" ? "iOS" : "Android"}${u.devices[0].model ? ` · ${u.devices[0].model}` : ""}` : null,
      status: u.status === "invited" ? "invited" : inNow.has(u.id) ? "in" : "active",
    })),
  };
}

export async function updatePerson(user: Staff, id: string, data: { name?: string; team?: string | null; role?: "employee" | "manager" | "company_admin"; contractHours?: number }) {
  await staffCanTouch(user, id);
  if (data.role && user.role !== "company_admin") throw bad("forbidden", "Only company admins can change roles.");
  const u = await db.user.update({ where: { id }, data });
  await audit(user.companyId, user.id, "user.update", "user", id, data);
  return u;
}

/* ───────────────────────────── Export ───────────────────────────── */

export type ExportFormat = "csv" | "xlsx" | "afas" | "nmbrs" | "loket" | "json";
export type ExportGrouping = "registration" | "day" | "period";
export type ExportOptions = { period: string; format: ExportFormat; grouping: ExportGrouping; ids: boolean; corrections: boolean; overtime: boolean; approvedOnly: boolean };

/** period: an ISO week (2026-W39) or a month (2026-09). */
export function periodRange(period: string, tz: string): { from: Date; to: Date } {
  if (/^\d{4}-W\d{2}$/.test(period)) {
    const from = weekStartFromIso(period, tz);
    return { from, to: addDays(from, 7, tz) };
  }
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw bad("period", "Unknown period.");
  const from = zonedTime(+m[1], +m[2], 1, 0, 0, tz);
  const to = zonedTime(+m[1], +m[2] + 1, 1, 0, 0, tz);
  return { from, to };
}

export async function exportRows(user: Staff, opts: ExportOptions) {
  const company = await companyOf(user);
  const tz = company.timezone;
  const { from, to } = periodRange(opts.period, tz);
  const scope = teamScope(user);
  const regs = await db.registration.findMany({
    where: { companyId: company.id, checkInAt: { gte: from, lt: to }, status: { in: ["ok", "pending"] }, user: scope },
    include: { user: true, location: true, corrections: { where: { status: { not: "pending" } }, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: [{ checkInAt: "asc" }],
  });
  const approvals = await db.timesheetApproval.findMany({ where: { user: { companyId: company.id } } });
  const approved = new Set(approvals.map((a) => `${a.userId}|${a.weekIso}`));
  const isApproved = (userId: string, at: Date) => approved.has(`${userId}|${isoWeek(at, tz)}`);
  const unapproved = regs.filter((r) => !isApproved(r.userId, r.checkInAt));
  const used = opts.approvedOnly ? regs.filter((r) => isApproved(r.userId, r.checkInAt)) : regs;
  const hours = (ms: number) => Math.round((ms / 3600_000) * 100) / 100;
  const major = company.major;

  let header: string[];
  let rows: (string | number)[][];
  if (opts.grouping === "registration") {
    header = ["employee_id", "employee", "team", "date", "check_in", "check_out", "hours", "location", ...(opts.ids ? ["spot", "major", "minor"] : []), ...(opts.corrections ? ["corrected", "original_in", "original_out"] : [])];
    rows = used.map((r) => [
      r.user.email, r.user.name, r.user.team ?? "", dayKey(r.checkInAt, tz), hm(r.checkInAt, tz), r.checkOutAt ? hm(r.checkOutAt, tz) : "", hours(countedMs(r, new Date())), r.location?.name ?? "",
      ...(opts.ids ? [r.spot ?? "", r.minor != null ? major : "", r.minor ?? ""] : []),
      ...(opts.corrections ? [r.source === "beacon" ? "no" : "yes", r.originalInAt ? hm(r.originalInAt, tz) : "", r.originalOutAt ? hm(r.originalOutAt, tz) : ""] : []),
    ]);
  } else {
    const groups = new Map<string, { user: (typeof used)[number]["user"]; key: string; ms: number; n: number }>();
    for (const r of used) {
      const key = opts.grouping === "day" ? dayKey(r.checkInAt, tz) : opts.period;
      const g = groups.get(`${r.userId}|${key}`) ?? { user: r.user, key, ms: 0, n: 0 };
      g.ms += countedMs(r, new Date()); g.n++;
      groups.set(`${r.userId}|${key}`, g);
    }
    const weeks = opts.grouping === "period" ? Math.max(1, Math.round((to.getTime() - from.getTime()) / (7 * 86400_000))) : 0;
    header = ["employee_id", "employee", "team", opts.grouping === "day" ? "date" : "period", "hours", "registrations", ...(opts.overtime && opts.grouping === "period" ? ["contract_hours", "overtime"] : [])];
    rows = [...groups.values()].sort((a, b) => a.user.name.localeCompare(b.user.name) || a.key.localeCompare(b.key)).map((g) => [
      g.user.email, g.user.name, g.user.team ?? "", g.key, hours(g.ms), g.n,
      ...(opts.overtime && opts.grouping === "period" ? [g.user.contractHours * weeks, hours(g.ms - g.user.contractHours * weeks * 3600_000)] : []),
    ]);
  }
  const slug = company.name.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "") || "timo";
  const ext = opts.format === "xlsx" ? "xlsx" : opts.format === "json" ? "json" : "csv";
  const fileName = `${slug}_hours_${opts.period}_${opts.format}.${ext}`;
  return { header, rows, fileName, unapprovedExcluded: opts.approvedOnly ? unapproved.length : 0, unapproved: unapproved.length };
}

export async function recentExports(user: Staff) {
  const list = await db.export.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "desc" }, take: 6 });
  const ids = [...new Set(list.map((e) => e.createdById).filter(Boolean) as string[])];
  const names = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return list.map((e) => ({ id: e.id, fileName: e.fileName, rows: e.rows, format: e.format, createdAt: e.createdAt.toISOString(), by: e.createdById ? names.get(e.createdById) ?? null : null }));
}

export async function logExport(user: Staff, opts: ExportOptions, fileName: string, rows: number) {
  await db.export.create({
    data: { companyId: user.companyId, period: opts.period, format: opts.format, grouping: opts.grouping, fields: Object.entries(opts).filter(([, v]) => v === true).map(([k]) => k), fileName, rows, createdById: user.id },
  });
}

export { localParts, isoWeek };
export type Where = Prisma.RegistrationWhereInput;
