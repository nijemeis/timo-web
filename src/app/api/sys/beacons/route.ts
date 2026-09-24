import { requireSystemAdmin, route } from "@/lib/api";
import { inventory } from "@/lib/sys";

/** GET ?status=all|active|supplied|shipped|stock */
export const GET = route(async (req) => { await requireSystemAdmin(); return inventory(new URL(req.url).searchParams.get("status") ?? undefined); });
