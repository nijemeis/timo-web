import { notFound, requireCompanyStaff, route, audit } from "@/lib/api";
import { db } from "@/lib/db";
import { sendMail, layout, esc } from "@/lib/email";
import { appUrl } from "@/lib/auth";

/** "Ask employee": email them to submit a correction for a missing check-out. (Push comes later.) */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const staff = await requireCompanyStaff();
  const reg = await db.registration.findUnique({ where: { id }, include: { user: true, location: true, company: true } });
  if (!reg || reg.companyId !== staff.companyId) throw notFound("Registration");
  const nl = reg.user.locale === "nl";
  const tz = reg.location?.timezone ?? reg.company.timezone;
  const day = reg.checkInAt.toLocaleDateString(nl ? "nl-NL" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
  const subject = nl ? `Ontbrekende check-out op ${day}` : `Missing check-out on ${day}`;
  const paras = nl
    ? [`Hallo ${esc(reg.user.name)},`, `Op ${esc(day)} (${esc(reg.location?.name ?? "")}) is geen vertrek gedetecteerd. Open Timo en vraag een correctie aan met je juiste check-out-tijd.`, `— ${esc(staff.name)}`]
    : [`Hi ${esc(reg.user.name)},`, `No exit was detected on ${esc(day)} (${esc(reg.location?.name ?? "")}). Open Timo and request a correction with your actual check-out time.`, `— ${esc(staff.name)}`];
  await sendMail({ to: reg.user.email, subject, html: layout(subject, paras, { href: appUrl(), label: nl ? "Open Timo" : "Open Timo" }), text: paras.join("\n\n") });
  await audit(staff.companyId, staff.id, "registration.ask", "registration", id);
  return { ok: true };
});
