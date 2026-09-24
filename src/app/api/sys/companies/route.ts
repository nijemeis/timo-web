import { z } from "zod";
import { requireSystemAdmin, route } from "@/lib/api";
import { companies, registerCompany } from "@/lib/sys";

export const GET = route(async () => { await requireSystemAdmin(); return { companies: await companies() }; });

/** POST {name, adminEmail, adminName?, beacons, major?} — assigns the next major (or the given one). */
export const POST = route(async (req) => {
  const actor = await requireSystemAdmin();
  const b = z.object({
    name: z.string().trim().min(2, "Enter the company name.").max(120),
    adminEmail: z.string().trim().toLowerCase().email("Enter a valid email address."),
    adminName: z.string().trim().max(120).optional(),
    beacons: z.number().int().min(0).max(500).default(0),
    major: z.number().int().min(1).max(65535).optional(),
  }).parse(await req.json());
  return registerCompany(actor, b);
});
