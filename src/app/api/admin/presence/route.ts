import { requireCompanyStaff, route } from "@/lib/api";
import { presence } from "@/lib/company";

export const GET = route(async () => presence(await requireCompanyStaff()));
