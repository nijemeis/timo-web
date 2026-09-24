import { z } from "zod";
import { requireSystemAdmin, route } from "@/lib/api";
import { previewMinors, programBeacons } from "@/lib/sys";

/** GET ?companyId&qty → the minors that would be assigned. POST {companyId, qty} → programs them. */
export const GET = route(async (req) => {
  await requireSystemAdmin();
  const q = new URL(req.url).searchParams;
  return previewMinors(q.get("companyId") ?? "", Math.max(1, Number(q.get("qty") ?? 1)));
});
export const POST = route(async (req) => {
  const actor = await requireSystemAdmin();
  const b = z.object({ companyId: z.string(), qty: z.number().int().min(1).max(500) }).parse(await req.json());
  return programBeacons(actor, b.companyId, b.qty);
});
