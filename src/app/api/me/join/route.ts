import { z } from "zod";
import { bad, requireUser, route } from "@/lib/api";
import { db } from "@/lib/db";
import { meResponse } from "@/lib/me";

/** POST {code} — an unaffiliated user joins a company with its self-registration code. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { code } = z.object({ code: z.string().trim().toUpperCase().min(3) }).parse(await req.json());
  if (user.companyId) throw bad("has_company", "You already belong to a company.");
  const c = await db.company.findUnique({ where: { code } });
  if (!c) throw bad("company_code", "We don't know this company code.", { code: "Unknown company code." });
  return meResponse(await db.user.update({ where: { id: user.id }, data: { companyId: c.id } }));
});
