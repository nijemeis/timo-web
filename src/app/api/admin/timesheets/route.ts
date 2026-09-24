import { requireCompanyStaff, route } from "@/lib/api";
import { timesheets } from "@/lib/company";

/** GET ?week=2026-W39&team=Warehouse */
export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams;
  return timesheets(await requireCompanyStaff(), q.get("week") || undefined, q.get("team") || undefined);
});
