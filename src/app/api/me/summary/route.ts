import { requireUser, route } from "@/lib/api";
import { db } from "@/lib/db";
import { userSummary } from "@/lib/registrations";
import { DEFAULT_TZ } from "@/lib/time";

/** Home screen: open registration, today's list, today + week totals. */
export const GET = route(async () => {
  const user = await requireUser();
  const company = user.companyId ? await db.company.findUnique({ where: { id: user.companyId } }) : null;
  return userSummary(user.id, user.contractHours, company?.timezone ?? DEFAULT_TZ);
});
