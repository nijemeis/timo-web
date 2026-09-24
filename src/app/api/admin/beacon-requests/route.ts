import { z } from "zod";
import { requireCompanyAdmin, route } from "@/lib/api";
import { requestBeacons } from "@/lib/company";

/** POST {quantity, locationId?, note?} */
export const POST = route(async (req) => {
  const b = z.object({ quantity: z.number().int().min(1).max(200), locationId: z.string().nullish(), note: z.string().max(500).nullish() }).parse(await req.json());
  return requestBeacons(await requireCompanyAdmin(), b);
});
