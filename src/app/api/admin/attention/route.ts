import { requireCompanyStaff, route } from "@/lib/api";
import { attention } from "@/lib/company";

export const GET = route(async () => attention(await requireCompanyStaff()));
