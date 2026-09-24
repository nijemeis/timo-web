import { bad, requireSystemAdmin, route } from "@/lib/api";
import { deliverRequest, fulfilRequest } from "@/lib/sys";

/** POST /api/sys/requests/:id/fulfil (program & ship) | deliver */
export const POST = route<{ id: string; action: string }>(async (_req, { id, action }) => {
  const actor = await requireSystemAdmin();
  if (action === "fulfil") return fulfilRequest(actor, id);
  if (action === "deliver") { await deliverRequest(actor, id); return { ok: true }; }
  throw bad("action", "Unknown action.");
});
