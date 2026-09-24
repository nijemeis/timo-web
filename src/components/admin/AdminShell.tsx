"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, Download, LogOut, RadioTower, TriangleAlert, UserPlus, Users, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { initials } from "@/lib/i18n";
import { api } from "@/lib/fetcher";
import { Brand } from "@/components/ui/Brand";
import { LangToggle } from "@/components/ui/LangToggle";
import { ToastProvider } from "@/components/ui/Toast";
import { signOut } from "@/components/ui/signOut";

export type AdminMe = { name: string; role: "company_admin" | "manager" | string; team: string | null };
export type AdminCompany = { name: string; major: number; code: string; timezone: string; locations: number };
type Ctx = { me: AdminMe; company: AdminCompany; isAdmin: boolean; tz: string; attention: number | null; refreshCounts: () => void };

const AdminCtx = createContext<Ctx | null>(null);
export function useAdmin() {
  const c = useContext(AdminCtx);
  if (!c) throw new Error("useAdmin outside AdminShell");
  return c;
}

const NAV: { href: string; icon: LucideIcon }[] = [
  { href: "/admin", icon: Users },
  { href: "/admin/timesheets", icon: CalendarRange },
  { href: "/admin/attention", icon: TriangleAlert },
  { href: "/admin/export", icon: Download },
  { href: "/admin/beacons", icon: RadioTower },
  { href: "/admin/people", icon: UserPlus },
];

export function AdminShell({ me, company, children }: { me: AdminMe; company: AdminCompany; children: React.ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  const [attention, setAttention] = useState<number | null>(null);

  const refreshCounts = useCallback(() => {
    api<{ missing: unknown[]; corrections: unknown[] }>("/api/admin/attention")
      .then((a) => setAttention(a.missing.length + a.corrections.length))
      .catch(() => {});
  }, []);
  useEffect(() => { refreshCounts(); }, [refreshCounts, path]);
  useEffect(() => {
    const iv = setInterval(() => { if (document.visibilityState === "visible") refreshCounts(); }, 60_000);
    return () => clearInterval(iv);
  }, [refreshCounts]);

  const isAdmin = me.role === "company_admin";
  const roleLabel = isAdmin ? t.roleAdmin : me.role === "manager" ? `${t.roleManager}${me.team ? ` · ${me.team}` : ""}` : t.roleEmployee;

  return (
    <AdminCtx.Provider value={{ me, company, isAdmin, tz: company.timezone, attention, refreshCounts }}>
      <ToastProvider>
        <div className="shell">
          <aside className="side">
            <div className="side-id">
              <Brand href="/admin" />
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{company.name}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>major {company.major} · {company.locations} {t.locationsN}</div>
              </div>
            </div>
            <nav>
              {NAV.map((n, i) => {
                const on = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
                const Icon = n.icon;
                return (
                  <Link key={n.href} href={n.href} className={`nav-i${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
                    <Icon size={18} strokeWidth={1.5} />
                    <span className="lab">{t.nav[i]}</span>
                    {i === 2 && !!attention && <span className="badge">{attention}</span>}
                  </Link>
                );
              })}
            </nav>
            <div className="side-foot">
              <LangToggle />
              <div className="me">
                <div className="avatar">{initials(me.name)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{me.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{roleLabel}</div>
                </div>
                <button className="signout" onClick={signOut} title={t.signOut} aria-label={t.signOut}><LogOut size={16} strokeWidth={1.5} /></button>
              </div>
            </div>
          </aside>
          <main className="main">{children}</main>
        </div>
      </ToastProvider>
    </AdminCtx.Provider>
  );
}
