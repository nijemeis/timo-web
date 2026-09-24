import { requireCompanyStaff, route } from "@/lib/api";
import { people } from "@/lib/company";

export const GET = route(async () => people(await requireCompanyStaff()));
