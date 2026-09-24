"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Building2, Inbox, LogOut, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { initials } from "@/lib/i18n";
import { api } from "@/lib/fetcher";
import { Brand } from "@/components/ui/Brand";
import { LangToggle } from "@/components/ui/LangToggle";
import { ToastProvider } from "@/components/ui/Toast";
import { signOut } from "@/components/ui/signOut";

export type Stats = { uuid: string; companies: number; majorFrom: number | null; majorTo: number | null; inField: number; stock: number; openRequests: number; nextMajor: number };
type Ctx = { stats: Stats | null; refreshStats: () => Promise<void> };
const SysCtx = createContext<Ctx | null>(null);
export function useSys() {
  const c = useContext(SysCtx);
  if (!c) throw new Error("useSys outside SysShell");
  return c;
}

const NAV: { href: string; icon: LucideIcon }[] = [
  { href: "/sys", icon: Building2 },
  { href: "/sys/inventory", icon: Boxes },
  { href: "/sys/requests", icon: Inbox },
];

/** The system admin frame: filled #e9e9ea sidebar, "Platform admin" + truncated proximity UUID. */
export function SysShell({ me, children }: { me: { name: string }; children: React.ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  const [stats, setStats] = useState<Stats | null>(null);
  const refreshStats = useCallback(async () => {
    try { setStats(await api<Stats>("/api/sys/stats")); } catch { /* keep the last numbers */ }
  }, []);
  useEffect(() => { refreshStats(); }, [refreshStats, path]);

  const uuid = stats?.uuid ?? "";
  return (
    <SysCtx.Provider value={{ stats, refreshStats }}>
      <ToastProvider>
        <div className="shell">
          <aside className="side filled">
            <div className="side-id">
              <Brand href="/sys" />
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{t.platform}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }} title={uuid}>UUID {uuid ? `${uuid.slice(0, 8)}…${uuid.slice(-4)}` : "…"}</div>
              </div>
            </div>
            <nav>
              {NAV.map((n, i) => {
                const on = n.href === "/sys" ? path === "/sys" : path.startsWith(n.href);
                const Icon = n.icon;
                return (
                  <Link key={n.href} href={n.href} className={`nav-i${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
                    <Icon size={18} strokeWidth={1.5} />
                    <span className="lab">{t.sysNav[i]}</span>
                    {i === 2 && !!stats?.openRequests && <span className="badge">{stats.openRequests}</span>}
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
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.sysRole}</div>
                </div>
                <button className="signout" onClick={signOut} title={t.signOut} aria-label={t.signOut}><LogOut size={16} strokeWidth={1.5} /></button>
              </div>
            </div>
          </aside>
          <main className="main">{children}</main>
        </div>
      </ToastProvider>
    </SysCtx.Provider>
  );
}

/** The four-cell KPI strip shown on every system admin page. */
export function SysKpis() {
  const { t } = useI18n();
  const { stats: s } = useSys();
  const cells: [string, number | string, string][] = [
    [t.kCompanies, s?.companies ?? "–", s?.majorFrom != null ? `${t.kCompSub} ${s.majorFrom}–${s.majorTo}` : t.kCompSub],
    [t.kBeacons, s?.inField ?? "–", t.kBSub],
    [t.kStock, s?.stock ?? "–", t.kStockSub],
    [t.kOpen, s?.openRequests ?? "–", t.kOpenSub],
  ];
  return (
    <div className="kpis sys" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
      {cells.map(([label, v, sub]) => (
        <div key={label} className="kpi">
          <span className="kicker">{label}</span>
          <span className="v">{v}</span>
          <span className="s">{sub}</span>
        </div>
      ))}
    </div>
  );
}
