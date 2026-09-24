import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { SysShell } from "@/components/sys/SysShell";

export const metadata = { title: "Timo · Platform admin" };

export default async function SysLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "system_admin") redirect("/");
  return <SysShell me={{ name: user.name }}>{children}</SysShell>;
}
