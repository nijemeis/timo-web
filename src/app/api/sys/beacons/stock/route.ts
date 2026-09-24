import { z } from "zod";
import { requireSystemAdmin, route } from "@/lib/api";
import { addStock } from "@/lib/sys";

/** POST {qty, serials?} — register blank units into stock. */
export const POST = route(async (req) => {
  const actor = await requireSystemAdmin();
  const b = z.object({ qty: z.number().int().min(1).max(500), serials: z.array(z.string().max(40)).optional() }).parse(await req.json());
  return addStock(actor, b.qty, b.serials);
});
