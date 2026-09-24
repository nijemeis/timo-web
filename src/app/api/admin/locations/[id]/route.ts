import { requireCompanyAdmin, route } from "@/lib/api";
import { upsertLocation } from "@/lib/company";
import { LocationBody } from "@/lib/schemas";

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const l = await upsertLocation(await requireCompanyAdmin(), { id, ...LocationBody.parse(await req.json()) });
  return { id: l.id };
});
