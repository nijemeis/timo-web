import { z } from "zod";
import { requireCompanyStaff, route } from "@/lib/api";
import { approveTimesheets } from "@/lib/company";

/** POST {week, userIds} — approves those sheets that are Ready. */
export const POST = route(async (req) => {
  const b = z.object({ week: z.string().regex(/^\d{4}-W\d{2}$/), userIds: z.array(z.string()).min(1) }).parse(await req.json());
  return approveTimesheets(await requireCompanyStaff(), b.week, b.userIds);
});
