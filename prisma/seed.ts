/**
 * Seed. `--base` (run on every production start) only ensures the first system admin exists.
 * Without flags it also loads the fictional demo estate from the design handoff: Northpier Logistics
 * (major 1042) with three locations, beacons, eleven people and two weeks of registrations, plus the other
 * demo companies. Demo emails use the reserved `.example` TLD so nothing is ever mailed to a real person.
 */
import { PrismaClient, type Placement, type RegStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, atLocalTime, autoCloseAt, startOfDay, startOfWeek } from "../src/lib/time";

const db = new PrismaClient();
const TZ = "Europe/Amsterdam";

async function base() {
  const email = (process.env.ADMIN_EMAIL || "admin@timo.local").toLowerCase();
  const pw = process.env.ADMIN_PASSWORD;
  const passwordHash = pw ? await bcrypt.hash(pw, 10) : undefined;
  await db.user.upsert({
    where: { email },
    create: { email, name: "Timo admin", role: "system_admin", status: "active", passwordHash },
    update: { role: "system_admin", ...(passwordHash ? { passwordHash } : {}) },
  });
  console.log(`system admin: ${email}`);
}

async function demo() {
  if (await db.company.findUnique({ where: { major: 1042 } })) {
    console.log("demo already present — skipping (run `npx prisma migrate reset` for a clean slate)");
    return;
  }
  // Other tenants, for the system admin tables.
  const others: [number, string, string, number, string, number, number][] = [
    [1041, "Veldhuis Bouw", "r.veldhuis@veldhuisbouw.example", 2, "VB-1041", 5, 5],
    [1043, "Studio Kade", "hallo@studiokade.example", 1, "SK-1043", 2, 2],
    [1044, "Zorggroep Linde", "ict@zorggroeplinde.example", 4, "ZL-1044", 8, 8],
    [1045, "Brouwer Techniek", "p.brouwer@brouwertechniek.example", 2, "BT-1045", 4, 4],
    [1046, "Café Molen", "eigenaar@cafemolen.example", 1, "CM-1046", 0, 1],
  ];
  let serial = 4000;
  for (const [major, name, email, nLoc, code, active, total] of others) {
    const c = await db.company.create({ data: { major, name, code, status: active ? "active" : "onboarding" } });
    const locs = [];
    for (let i = 0; i < nLoc; i++) locs.push(await db.location.create({ data: { companyId: c.id, name: i === 0 ? "Main site" : `Site ${i + 1}`, capacity: 20 } }));
    await db.user.create({ data: { email, name: email.split("@")[0].replace(/[._]/g, " "), companyId: c.id, role: "company_admin", status: active ? "active" : "invited" } });
    for (let m = 1; m <= total; m++) {
      await db.beacon.create({
        data: {
          serial: `TB-26-0${serial++}`, major, minor: m, companyId: c.id, firmware: "1.4.2", battery: 60 + ((m * 7) % 40),
          status: m <= active ? "active" : "shipped", locationId: m <= active ? locs[(m - 1) % locs.length].id : null,
          spot: m <= active ? (m === 1 ? "Entrance" : `Zone ${m}`) : null, lastSeenAt: m <= active ? new Date(Date.now() - m * 60_000) : null, programmedAt: new Date(),
        },
      });
    }
  }
  for (let i = 0; i < 6; i++) await db.beacon.create({ data: { serial: `TB-26-0${4200 + i}`, status: "stock", firmware: "1.4.2", battery: 100 } });

  // Northpier Logistics — the company every screen in the handoff shows.
  const np = await db.company.create({ data: { major: 1042, name: "Northpier Logistics", code: "NP-1042", status: "active", ssoDomains: "northpier.example" } });
  const hq = await db.location.create({ data: { companyId: np.id, name: "HQ Utrecht", short: "HQ", capacity: 24 } });
  const ams = await db.location.create({ data: { companyId: np.id, name: "Amsterdam Hub", short: "AMS", capacity: 12 } });
  const rtm = await db.location.create({ data: { companyId: np.id, name: "Rotterdam Depot", short: "RTM", capacity: 8 } });
  const placed: [number, string, string, Placement, number][] = [
    [1, hq.id, "Main entrance", "entrance", 86], [2, hq.id, "Warehouse B", "zone", 71], [3, hq.id, "Loading dock", "entrance", 17],
    [7, ams.id, "Reception", "entrance", 64], [8, ams.id, "Floor 2", "zone", 92], [12, rtm.id, "Gate", "entrance", 55],
  ];
  const beaconByMinor = new Map<number, { id: string; locationId: string; spot: string }>();
  for (const [minor, locationId, spot, placement, battery] of placed) {
    const b = await db.beacon.create({
      data: { serial: `TB-26-0${4100 + minor}`, major: 1042, minor, companyId: np.id, locationId, spot, placement, status: "active", battery, firmware: "1.4.2", lastSeenAt: new Date(Date.now() - minor * 90_000), programmedAt: new Date("2026-01-12"), activatedAt: new Date("2026-01-20") },
    });
    beaconByMinor.set(minor, { id: b.id, locationId, spot });
  }
  // Minors 4–6 and 9–11 were retired; 13–14 arrived, 15–16 are on their way.
  const req = await db.beaconRequest.create({ data: { companyId: np.id, quantity: 2, locationId: ams.id, note: "Second floor entrance", status: "shipped", assignedMinors: [15, 16], shippedAt: new Date() } });
  for (const [minor, status] of [[13, "supplied"], [14, "supplied"], [15, "shipped"], [16, "shipped"]] as const) {
    await db.beacon.create({ data: { serial: `TB-26-0${4100 + minor}`, major: 1042, minor, companyId: np.id, status, battery: 100, firmware: "1.4.2", programmedAt: new Date(), requestId: minor >= 15 ? req.id : null } });
  }

  const people: [string, string, string, number, "employee" | "manager" | "company_admin"][] = [
    ["Mark Jansen", "mark.jansen", "Management", 40, "company_admin"],
    ["Sanne de Vries", "sanne.devries", "Operations", 40, "employee"],
    ["Tom Bakker", "tom.bakker", "Warehouse", 38, "employee"],
    ["Ahmed El Idrissi", "ahmed.elidrissi", "Warehouse", 40, "employee"],
    ["Priya Raman", "priya.raman", "Warehouse", 32, "manager"],
    ["Jesse de Boer", "jesse.deboer", "Warehouse", 40, "employee"],
    ["Noor Hendriks", "noor.hendriks", "Operations", 36, "employee"],
    ["Eva Mulder", "eva.mulder", "Customer service", 32, "employee"],
    ["Lotte Visser", "lotte.visser", "Finance", 24, "employee"],
    ["Daan Smit", "daan.smit", "Operations", 40, "employee"],
    ["Fleur Kok", "fleur.kok", "Customer service", 32, "employee"],
  ];
  const users = new Map<string, string>();
  for (const [name, handle, team, contractHours, role] of people) {
    const u = await db.user.create({ data: { name, email: `${handle}@northpier.example`, team, contractHours, role, companyId: np.id, status: "active" } });
    users.set(handle, u.id);
    await db.device.create({ data: { userId: u.id, installId: `seed-${handle}`, platform: handle.length % 2 ? "ios" : "android", model: handle.length % 2 ? "iPhone 15" : "Pixel 8" } });
  }
  await db.user.create({ data: { name: "Bram Peters", email: "bram.peters@northpier.example", team: "Warehouse", companyId: np.id, status: "invited" } });
  await db.beaconRequest.create({ data: { companyId: np.id, quantity: 3, locationId: rtm.id, note: "New loading bay, north side", requestedById: users.get("mark.jansen") } });

  // Home minor, usual start (hh:mm) and usual length (minutes) per person.
  const habits: Record<string, [number, string, number]> = {
    "mark.jansen": [1, "08:31", 520], "sanne.devries": [1, "07:58", 492], "tom.bakker": [2, "06:02", 480], "ahmed.elidrissi": [2, "06:28", 480],
    "priya.raman": [2, "06:31", 450], "jesse.deboer": [12, "05:57", 470], "noor.hendriks": [1, "08:05", 460], "eva.mulder": [8, "08:15", 440],
    "lotte.visser": [7, "08:40", 300], "daan.smit": [1, "08:10", 500], "fleur.kok": [7, "08:20", 450],
  };
  const now = new Date();
  const today0 = startOfDay(now, TZ);
  const week0 = startOfWeek(now, TZ);
  const from = addDays(week0, -7, TZ);
  const absentToday = new Set(["daan.smit", "fleur.kok"]);
  let seq = 1;
  for (const [handle, [minor, start, len]] of Object.entries(habits)) {
    const userId = users.get(handle)!;
    const device = await db.device.findFirst({ where: { userId } });
    for (let day = from; day <= today0; day = addDays(day, 1, TZ)) {
      const wd = new Date(day.getTime() + 12 * 3600_000).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      const isToday = day.getTime() === today0.getTime();
      if (isToday && absentToday.has(handle)) continue;
      const jitter = ((handle.length * 7 + day.getUTCDate() * 13) % 21) - 10;
      const inAt = new Date(atLocalTime(day, start, TZ).getTime() + jitter * 60_000);
      if (isToday && inAt > now) continue;
      const b = beaconByMinor.get(minor)!;
      let outAt: Date | null = new Date(inAt.getTime() + (len + jitter * 2) * 60_000);
      let status: RegStatus = "ok";
      if (isToday) { outAt = null; status = "open"; }
      // One forgotten check-out last week and one this week.
      if ((handle === "tom.bakker" && day.getTime() === addDays(from, 2, TZ).getTime()) || (handle === "ahmed.elidrissi" && day.getTime() === addDays(today0, -1, TZ).getTime() && addDays(today0, -1, TZ) >= week0)) {
        status = "auto"; outAt = autoCloseAt(inAt, TZ);
      }
      const reg = await db.registration.create({
        data: { userId, companyId: np.id, beaconId: b.id, minor, locationId: b.locationId, spot: b.spot, checkInAt: inAt, checkOutAt: outAt, lastSeenAt: outAt ?? now, status, source: "beacon", originalInAt: inAt, originalOutAt: outAt },
      });
      await db.beaconEvent.create({ data: { userId, deviceId: device!.id, uuid: "A1CA9F6B-CFC3-4DC6-9A4D-B4FB1B691C3D", major: 1042, minor, type: "enter", at: inAt, seq: seq++, outcome: "checkin", rssi: -61 } });
      if (outAt && status === "ok") await db.beaconEvent.create({ data: { userId, deviceId: device!.id, uuid: "A1CA9F6B-CFC3-4DC6-9A4D-B4FB1B691C3D", major: 1042, minor, type: "exit", at: outAt, seq: seq++, outcome: "checkout", rssi: -84 } });
      // Sanne asks to correct Monday's times; Noor forgot to check out on Tuesday and asks for a fix.
      if ((handle === "sanne.devries" || handle === "noor.hendriks") && day.getTime() === addDays(week0, handle === "sanne.devries" ? 0 : 1, TZ).getTime() && day < today0) {
        await db.correctionRequest.create({
          data: {
            registrationId: reg.id, userId, type: handle === "sanne.devries" ? "wrong_times" : "forgot_checkout", priorStatus: "ok",
            requestedIn: handle === "sanne.devries" ? new Date(inAt.getTime() - 25 * 60_000) : inAt,
            requestedOut: handle === "sanne.devries" ? outAt! : atLocalTime(day, "17:30", TZ),
            note: handle === "sanne.devries" ? "Beacon missed me — I came in through the side door at 07:35." : "Phone battery died at 17:30",
          },
        });
        await db.registration.update({ where: { id: reg.id }, data: { status: "pending" } });
      }
    }
    // Last week's clean sheets are approved.
    if (!["tom.bakker"].includes(handle)) {
      const { isoWeek } = await import("../src/lib/time");
      await db.timesheetApproval.create({ data: { userId, weekIso: isoWeek(from, TZ), approvedById: users.get("mark.jansen")! } });
    }
  }
  console.log("demo estate loaded: Northpier Logistics (major 1042) + 5 other companies");
}

(async () => {
  await base();
  if (!process.argv.includes("--base")) await demo();
})()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
