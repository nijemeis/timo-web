import { requireSystemAdmin, route } from "@/lib/api";
import { stats } from "@/lib/sys";

export const GET = route(async () => { await requireSystemAdmin(); return stats(); });
