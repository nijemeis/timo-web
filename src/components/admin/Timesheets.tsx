"use client";
import { useMemo, useState } from "react";
import { Check, CheckCheck, ChevronLeft, ChevronRight, Clock, TriangleAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { dom, hm, hrs, num, rangeLabel, weekNo } from "@/lib/i18n";
import { api, errText } from "@/lib/fetcher";
import { Bp } from "@/components/ui/Bp";
import { PageHead } from "@/components/ui/PageHead";
import { Tag } from "@/components/ui/Tag";
import { LoadState } from "@/components/ui/LoadState";
import { useApi } from "@/components/ui/hooks";
import { useToast } from "@/components/ui/Toast";
import { useAdmin } from "./AdminShell";

type Reg = { id: string; in: string; out: string | null; status: string; location: string; spot: string | null };
type Day = { day: string; ms: number; auto: boolean; regs: Reg[] };
type Row = { userId: string; name: string; team: string | null; contractHours: number; days: Day[]; totalMs: number; deltaMs: number; status: "review" | "approved" | "ready" };
type Sheet = { week: string; days: string[]; today: string; prev: string; next: string; teams: string[]; rows: Row[] };

export function Timesheets() {
  const { t, lang } = useI18n();
  const { tz } = useAdmin();
  const toast = useToast();
  const [week, setWeek] = useState<string | null>(null);
  const [team, setTeam] = useState<string>("");
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qs = new URLSearchParams({ ...(week ? { week } : {}), ...(team ? { team } : {}) }).toString();
  const { data, error, reload } = useApi<Sheet>(`/api/admin/timesheets${qs ? `?${qs}` : ""}`, { poll: 60_000 });
  const teams = data?.teams ?? [];

  // Mon–Fri, plus the weekend when anyone registered time on it.
  const shown = useMemo(() => {
    if (!data) return [] as number[];
    const weekend = [5, 6].filter((i) => data.rows.some((r) => r.days[i].regs.length > 0));
    return [0, 1, 2, 3, 4, ...weekend];
  }, [data]);

  const rows = data?.rows ?? [];
  const selRow = rows.find((r) => r.userId === sel) ?? rows[0];
  const ready = rows.filter((r) => r.status === "ready");
  const weekLabel = data ? `Week ${weekNo(data.week)} · ${rangeLabel(data.days[0], data.days[6], lang)}` : "";

  async function approve(ids: string[], name?: string) {
    if (!data || !ids.length) return;
    setBusy(true);
    try {
      const r = await api<{ approved: number }>("/api/admin/timesheets/approve", { body: { week: data.week, userIds: ids } });
      toast(name ? `${t.tApproved} — ${name}` : `${r.approved} ${t.tAllApproved}`);
      await reload();
    } catch (e) {
      toast(errText(e, t), { error: true });
    } finally { setBusy(false); }
  }

  const statusTag = (s: Row["status"]) =>
    s === "approved" ? <Tag kind="ok" icon={Check}>{t.approved}</Tag> : s === "ready" ? <Tag kind="ready" icon={Clock}>{t.ready}</Tag> : <Tag kind="alert" icon={TriangleAlert}>{t.review}</Tag>;

  return (
    <>
      <PageHead kicker={data ? `${t.kick[1]} ${weekNo(data.week)}` : t.kick[1]} title={t.nav[1]}>
        {data && (
          <div className="weeksw">
            <button onClick={() => setWeek(data.prev)} aria-label={t.weekPrev}><ChevronLeft size={16} strokeWidth={1.5} /></button>
            <div className="lab">{weekLabel}</div>
            <button onClick={() => setWeek(data.next)} aria-label={t.weekNext} disabled={data.days[0] > data.today}><ChevronRight size={16} strokeWidth={1.5} /></button>
          </div>
        )}
      </PageHead>
      {!data ? <LoadState error={error} onRetry={reload} /> : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["", ...teams].map((k) => (
                <button key={k || "all"} className={`chip${team === k ? " on" : ""}`} onClick={() => setTeam(k)}>{k || t.allTeams}</button>
              ))}
            </div>
            <button className="btn btn-p btn-hero" disabled={!ready.length || busy} onClick={() => approve(ready.map((r) => r.userId))}>
              <CheckCheck size={17} strokeWidth={1.5} />{t.approveAll}{ready.length ? ` (${ready.length})` : ""}<Bp />
            </button>
          </div>
          <table className="tbl tnum">
            <thead>
              <tr>
                <th>{t.employee}</th>
                {shown.map((i) => <th key={i} className="r" style={{ width: 62 }}>{t.days[i]} {dom(data.days[i])}</th>)}
                <th className="r">{t.total}</th><th className="r">{t.contract}</th><th className="r">+/−</th><th>{t.status}</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = r.deltaMs / 3600_000;
                return (
                  <tr key={r.userId} className={`click${selRow?.userId === r.userId ? " sel" : ""}`} onClick={() => setSel(r.userId)}>
                    <td><div className="b">{r.name}</div><div className="sub">{r.team ?? ""}</div></td>
                    {shown.map((i) => {
                      const day = r.days[i];
                      const isToday = data.days[i] === data.today;
                      return (
                        <td key={i} className="r" style={{ color: day.auto ? "var(--accent-900)" : isToday ? "var(--accent-700)" : undefined, fontWeight: day.auto ? 700 : 400 }}>
                          {day.auto ? "?" : day.ms > 0 ? hrs(day.ms, lang) : "–"}
                        </td>
                      );
                    })}
                    <td className="r b">{hrs(r.totalMs, lang)}</td>
                    <td className="r muted">{num(r.contractHours, lang, r.contractHours % 1 ? 1 : 0)}</td>
                    <td className="r b">{d >= 0 ? "+" : "−"}{num(Math.abs(d), lang)}</td>
                    <td>{statusTag(r.status)}</td>
                    <td className="r">
                      {r.status === "ready" && (
                        <button className="btn btn-light btn-xs" disabled={busy} onClick={(e) => { e.stopPropagation(); approve([r.userId], r.name); }}>{t.approve}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="help" style={{ fontSize: 14 }}>{t.noSheets}</div>}
          {selRow && (
            <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <Bp />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <div className="h2">{selRow.name} <span className="h2-n">· {weekLabel}</span></div>
                <div className="help">{t.rawNote}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${shown.length},minmax(0,1fr))`, gap: 12 }}>
                {shown.map((i) => {
                  const day = selRow.days[i];
                  const isToday = data.days[i] === data.today;
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `2px solid ${day.auto ? "var(--accent-900)" : isToday ? "var(--accent)" : "var(--text)"}`, paddingTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 600, color: "var(--muted)" }}>
                        <span>{t.days[i]} {dom(data.days[i])}</span>
                        <span className="tnum">{day.auto ? "?" : day.ms > 0 ? hrs(day.ms, lang) : "–"}</span>
                      </div>
                      {day.regs.map((e) => (
                        <div key={e.id} className="tnum" style={{ fontSize: 13 }}>
                          <div style={{ fontWeight: 600 }}>
                            {hm(e.in, tz)} – {e.status === "open" ? "…" : e.out ? hm(e.out, tz) : "…"}{e.status === "auto" ? " ?" : ""}
                          </div>
                          <div className="muted" style={{ fontSize: 12 }}>{e.location}{e.spot ? ` · ${e.spot}` : ""}</div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
