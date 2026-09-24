import { z } from "zod";
import { requireCompanyStaff, route } from "@/lib/api";
import { updatePerson } from "@/lib/company";

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const b = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    team: z.string().trim().max(60).nullish(),
    role: z.enum(["employee", "manager", "company_admin"]).optional(),
    contractHours: z.number().min(0).max(60).optional(),
  }).parse(await req.json());
  const u = await updatePerson(await requireCompanyStaff(), id, b);
  return { id: u.id };
});
