import { requireCompanyAdmin, route } from "@/lib/api";
import { upsertLocation } from "@/lib/company";
import { LocationBody } from "@/lib/schemas";

export const POST = route(async (req) => {
  const l = await upsertLocation(await requireCompanyAdmin(), LocationBody.parse(await req.json()));
  return { id: l.id };
});
