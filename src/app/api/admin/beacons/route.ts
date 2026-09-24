import { requireCompanyStaff, route } from "@/lib/api";
import { beaconsOverview } from "@/lib/company";

export const GET = route(async () => beaconsOverview(await requireCompanyStaff()));
