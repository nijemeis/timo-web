import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata = { title: "Timo" };

/** Company admin + manager area. Managers get the same screens, scoped to their team by the API. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if ((user.role !== "company_admin" && user.role !== "manager") || !user.companyId) redirect("/");
  const company = await db.company.findUnique({ where: { id: user.companyId }, include: { _count: { select: { locations: true } } } });
  if (!company) redirect("/");
  return (
    <AdminShell
      me={{ name: user.name, role: user.role, team: user.team }}
      company={{ name: company.name, major: company.major, code: company.code, timezone: company.timezone, locations: company._count.locations }}
    >
      {children}
    </AdminShell>
  );
}
