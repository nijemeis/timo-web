import { bad, requireCompanyStaff, route } from "@/lib/api";
import { decideCorrection } from "@/lib/company";

/** POST /api/admin/corrections/:id/approve | decline */
export const POST = route<{ id: string; action: string }>(async (_req, { id, action }) => {
  if (action !== "approve" && action !== "decline") throw bad("action", "Unknown action.");
  await decideCorrection(await requireCompanyStaff(), id, action === "approve");
  return { ok: true };
});
