import { z } from "zod";
import { requireCompanyAdmin, route } from "@/lib/api";
import { activateBeacon } from "@/lib/company";

/** PATCH {locationId, spot, placement} — link a supplied beacon to a spot and activate it. */
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const b = z.object({ locationId: z.string().min(1, "Pick a location."), spot: z.string().trim().min(1, "Name the spot.").max(60), placement: z.enum(["entrance", "zone"]) }).parse(await req.json());
  const beacon = await activateBeacon(await requireCompanyAdmin(), id, b);
  return { id: beacon.id, status: beacon.status };
});
