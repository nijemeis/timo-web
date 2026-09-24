import { requireSystemAdmin, route } from "@/lib/api";
import { requests } from "@/lib/sys";

export const GET = route(async () => { await requireSystemAdmin(); return { requests: await requests() }; });
