import { z } from "zod";
import { bad, clientIp, rateLimit, route } from "@/lib/api";
import { db } from "@/lib/db";
import { issueMagicLink } from "@/lib/magic";

const Body = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  companyCode: z.string().trim().toUpperCase().max(20).optional().nullable(),
  locale: z.enum(["en", "nl"]).optional(),
  client: z.enum(["web", "app"]).default("app"),
});

/**
 * POST {name, email, companyCode?} → sends a magic link. With a valid code the user joins that company as an
 * employee; without one the account is unaffiliated and beacons do nothing until they join.
 */
export const POST = route(async (req) => {
  const b = Body.parse(await req.json());
  rateLimit(`reg:${clientIp(req)}`, 10);
  let companyId: string | null = null;
  if (b.companyCode) {
    const c = await db.company.findUnique({ where: { code: b.companyCode } });
    if (!c) throw bad("company_code", "We don't know this company code.", { companyCode: "Unknown company code." });
    companyId = c.id;
  }
  const existing = await db.user.findUnique({ where: { email: b.email } });
  if (existing) {
    if (companyId && !existing.companyId) await db.user.update({ where: { id: existing.id }, data: { companyId } });
    if (companyId && existing.companyId && existing.companyId !== companyId) throw bad("other_company", "This email already belongs to another company.", { email: "Already registered with another company." });
  } else {
    await db.user.create({ data: { email: b.email, name: b.name, companyId, locale: b.locale ?? null, status: "invited" } });
  }
  return issueMagicLink(b.email, b.client);
});
