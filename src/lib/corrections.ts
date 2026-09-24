import "server-only";
import type { User } from "@prisma/client";
import { db } from "./db";
import { validateCorrection } from "./engine";
import { atLocalTime, dayKey, DEFAULT_TZ, zonedTime } from "./time";
import { bad, notFound, audit } from "./api";
import type { CorrectionRequestBody } from "./types";

const messages: Record<string, string> = {
  out_before_in: "Check-out must be after check-in.",
  not_same_day: "Both times must be on the same day.",
  too_long: "A registration can be at most 16 hours.",
};

/** Employee asks to correct one of their registrations. The registration becomes `pending`; originals stay. */
export async function requestCorrection(user: User, regId: string, body: CorrectionRequestBody) {
  const reg = await db.registration.findUnique({ where: { id: regId }, include: { location: true, company: true } });
  if (!reg || reg.userId !== user.id) throw notFound("Registration");
  if (reg.status === "open") throw bad("running", "A running registration can't be corrected yet.");
  if (reg.status === "pending") throw bad("pending", "A correction for this registration is already pending.");
  const tz = reg.location?.timezone ?? reg.company.timezone;
  let inAt: Date, outAt: Date;
  try {
    inAt = atLocalTime(reg.checkInAt, body.checkIn, tz);
    outAt = atLocalTime(reg.checkInAt, body.checkOut, tz);
  } catch {
    throw bad("time", "Use times like 07:58.", { checkIn: "HH:MM", checkOut: "HH:MM" });
  }
  const err = validateCorrection(inAt, outAt, (a, b) => dayKey(a, tz) === dayKey(b, tz));
  if (err) throw bad(err, messages[err], { checkOut: messages[err] });
  const c = await db.$transaction(async (tx) => {
    const c = await tx.correctionRequest.create({
      data: { registrationId: reg.id, userId: user.id, type: body.type, requestedIn: inAt, requestedOut: outAt, note: body.note?.trim() || null, priorStatus: reg.status, locationId: reg.locationId },
    });
    await tx.registration.update({ where: { id: reg.id }, data: { status: "pending" } });
    return c;
  });
  await audit(reg.companyId, user.id, "correction.request", "correction", c.id, { registrationId: reg.id, type: body.type });
  return c;
}

/** Employee reports a registration that is missing entirely (no registration to attach to). */
export async function requestMissing(user: User, body: CorrectionRequestBody) {
  if (!user.companyId) throw bad("no_company", "Join a company first.");
  const company = await db.company.findUnique({ where: { id: user.companyId } });
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(body.date ?? "");
  if (!m) throw bad("date", "Pick the day.", { date: "yyyy-mm-dd" });
  let tz = company?.timezone ?? DEFAULT_TZ;
  if (body.locationId) {
    const loc = await db.location.findUnique({ where: { id: body.locationId } });
    if (!loc || loc.companyId !== user.companyId) throw bad("location", "Pick one of your locations.");
    tz = loc.timezone;
  }
  const day = zonedTime(+m[1], +m[2], +m[3], 12, 0, tz);
  let inAt: Date, outAt: Date;
  try {
    inAt = atLocalTime(day, body.checkIn, tz);
    outAt = atLocalTime(day, body.checkOut, tz);
  } catch {
    throw bad("time", "Use times like 07:58.");
  }
  const err = validateCorrection(inAt, outAt, (a, b) => dayKey(a, tz) === dayKey(b, tz));
  if (err) throw bad(err, messages[err], { checkOut: messages[err] });
  if (outAt > new Date()) throw bad("future", "That time hasn't happened yet.");
  const c = await db.correctionRequest.create({
    data: { userId: user.id, type: "missing", requestedIn: inAt, requestedOut: outAt, note: body.note?.trim() || null, locationId: body.locationId || null },
  });
  await audit(user.companyId, user.id, "correction.request", "correction", c.id, { type: "missing" });
  return c;
}
