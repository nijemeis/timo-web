import { requireUser, route } from "@/lib/api";
import { requestMissing } from "@/lib/corrections";
import { CorrectionBody as Body } from "@/lib/schemas";

/** Report a missing registration (date + times + location). */
export const POST = route(async (req) => {
  const user = await requireUser();
  const c = await requestMissing(user, Body.parse(await req.json()));
  return { id: c.id, status: c.status };
});
