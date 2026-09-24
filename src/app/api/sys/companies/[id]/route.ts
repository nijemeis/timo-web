import { z } from "zod";
import { requireSystemAdmin, route } from "@/lib/api";
import { updateCompany } from "@/lib/sys";

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const actor = await requireSystemAdmin();
  const b = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    status: z.enum(["onboarding", "active"]).optional(),
    graceMinutes: z.number().int().min(0).max(60).optional(),
    ssoDomains: z.string().trim().max(300).nullish(),
    ssoIssuer: z.string().trim().url().nullish().or(z.literal("")),
    ssoClientId: z.string().trim().max(300).nullish(),
    ssoClientSecret: z.string().trim().max(500).nullish(),
  }).parse(await req.json());
  const c = await updateCompany(actor, id, { ...b, ssoIssuer: b.ssoIssuer || null });
  return { id: c.id };
});
