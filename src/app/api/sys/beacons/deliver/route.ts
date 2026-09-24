import { z } from "zod";
import { requireSystemAdmin, route } from "@/lib/api";
import { markDelivered } from "@/lib/sys";

/** POST {ids} — shipped beacons arrived at the customer (→ supplied). */
export const POST = route(async (req) => {
  const actor = await requireSystemAdmin();
  const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(await req.json());
  await markDelivered(actor, ids);
  return { ok: true };
});
