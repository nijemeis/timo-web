import { z } from "zod";
import { bad, requireCompanyAdmin, route, audit } from "@/lib/api";
import { db } from "@/lib/db";
import { issueMagicLink } from "@/lib/magic";

/** POST {emails: "a@x.nl, b@x.nl\n…", team?, contractHours?} — invitees get a magic link plus the company code. */
export const POST = route(async (req) => {
  const admin = await requireCompanyAdmin();
  const b = z.object({ emails: z.string().min(3), team: z.string().trim().max(60).nullish(), contractHours: z.number().min(0).max(60).default(40) }).parse(await req.json());
  const emails = [...new Set(b.emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const invalid = emails.filter((e) => !z.string().email().safeParse(e).success);
  if (!emails.length || invalid.length) throw bad("emails", invalid.length ? `Not an email address: ${invalid.join(", ")}` : "Add at least one email address.", { emails: "Check the addresses." });
  const company = (await db.company.findUnique({ where: { id: admin.companyId } }))!;
  const invited: string[] = [];
  const skipped: string[] = [];
  for (const email of emails) {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing && existing.companyId && existing.companyId !== company.id) { skipped.push(email); continue; }
    const name = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    await db.user.upsert({
      where: { email },
      create: { email, name, companyId: company.id, team: b.team || null, contractHours: b.contractHours, status: "invited" },
      update: { companyId: company.id, team: b.team || undefined, contractHours: b.contractHours },
    });
    await issueMagicLink(email, "app", { invite: { companyName: company.name, code: company.code, inviter: admin.name } });
    invited.push(email);
  }
  await audit(company.id, admin.id, "people.invite", "user", null, { invited, skipped });
  return { invited: invited.length, skipped };
});
