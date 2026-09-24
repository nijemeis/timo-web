import { requireUser, route } from "@/lib/api";
import { userRegistrations } from "@/lib/registrations";

/** GET ?from=ISO&to=ISO&location=id&attention=1 */
export const GET = route(async (req) => {
  const user = await requireUser();
  const q = new URL(req.url).searchParams;
  const d = (k: string) => (q.get(k) ? new Date(q.get(k)!) : undefined);
  return userRegistrations(user.id, { from: d("from"), to: d("to"), locationId: q.get("location") || undefined, attention: q.get("attention") === "1" });
});
