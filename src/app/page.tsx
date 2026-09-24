import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { EmployeeHome } from "@/components/auth/EmployeeHome";

/** Role-based landing: system admins → /sys, company staff → /admin, employees → "Timo works in the app". */
export default async function Home() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role === "system_admin") redirect("/sys");
  if ((user.role === "company_admin" || user.role === "manager") && user.companyId) redirect("/admin");
  return <EmployeeHome name={user.name} email={user.email} />;
}
