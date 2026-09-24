import { z } from "zod";
import { requireUser, route } from "@/lib/api";
import { db } from "@/lib/db";
import { meResponse } from "@/lib/me";

export const GET = route(async () => meResponse(await requireUser()));

/** PATCH {name?, locale?} */
export const PATCH = route(async (req) => {
  const user = await requireUser();
  const b = z.object({ name: z.string().trim().min(2).max(120).optional(), locale: z.enum(["en", "nl"]).optional() }).parse(await req.json());
  return meResponse(await db.user.update({ where: { id: user.id }, data: b }));
});
