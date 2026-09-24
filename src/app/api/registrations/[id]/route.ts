import { notFound, requireUser, route } from "@/lib/api";
import { db } from "@/lib/db";
import { regInclude, toDTO } from "@/lib/registrations";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser();
  const r = await db.registration.findUnique({ where: { id }, include: regInclude });
  if (!r || r.userId !== user.id) throw notFound("Registration");
  return toDTO(r);
});
