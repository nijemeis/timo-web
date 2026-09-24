import { requireUser, route } from "@/lib/api";
import { requestCorrection } from "@/lib/corrections";
import { db } from "@/lib/db";
import { regInclude, toDTO } from "@/lib/registrations";
import { CorrectionBody as Body } from "@/lib/schemas";


/** Request a correction of one of my registrations → the updated registration (status pending). */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser();
  await requestCorrection(user, id, Body.parse(await req.json()));
  return toDTO((await db.registration.findUnique({ where: { id }, include: regInclude }))!);
});
