import { z } from "zod";
import { bad, notFound, requireCompanyStaff, route } from "@/lib/api";
import { setCheckout } from "@/lib/company";
import { db } from "@/lib/db";
import { atLocalTime } from "@/lib/time";

/** PATCH {checkOut: "HH:MM"} — resolve a missing check-out on the registration's own day. */
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const user = await requireCompanyStaff();
  const { checkOut } = z.object({ checkOut: z.string() }).parse(await req.json());
  const reg = await db.registration.findUnique({ where: { id }, include: { location: true, company: true } });
  if (!reg || reg.companyId !== user.companyId) throw notFound("Registration");
  let at: Date;
  try { at = atLocalTime(reg.checkInAt, checkOut, reg.location?.timezone ?? reg.company.timezone); } catch { throw bad("time", "Use a time like 17:30.", { checkOut: "HH:MM" }); }
  await setCheckout(user, id, at);
  return { ok: true };
});
