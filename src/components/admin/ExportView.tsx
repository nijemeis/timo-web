"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Download, FileSpreadsheet, Info, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { dayMon, fill, monthName, num, weekNo } from "@/lib/i18n";
import { addDays, isoWeek, localParts, startOfWeek } from "@/lib/time";
import { api, errText } from "@/lib/fetcher";
import { Bp } from "@/components/ui/Bp";
import { PageHead } from "@/components/ui/PageHead";
import { useApi } from "@/components/ui/hooks";
import { useToast } from "@/components/ui/Toast";
import { useAdmin } from "./AdminShell";

type Format = "csv" | "xlsx" | "afas" | "nmbrs" | "loket" | "json";
type Grouping = "registration" | "day" | "period";
type Opts = { period: string; format: Format; grouping: Grouping; ids: boolean; corrections: boolean; overtime: boolean; approvedOnly: boolean };
type Preview = { header: string[]; rows: (string | number)[][]; total: number; fileName: string; unapproved: number; unapprovedExcluded: number };
type Recent = { recent: { id: string; fileName: string; rows: number; createdAt: string; by: string | null }[] };

const FORMATS: [Format, string][] = [["csv", "CSV"], ["xlsx", "Excel"], ["afas", "AFAS Profit"], ["nmbrs", "Nmbrs"], ["loket", "Loket.nl"], ["json", "JSON / API"]];
const HOURS_COLS = new Set(["hours", "overtime", "contract_hours"]);

export function ExportView() {
  const { t, lang } = useI18n();
  const { tz } = useAdmin();
  const toast = useToast();

  const periods = useMemo(() => {
    const now = new Date();
    const w0 = startOfWeek(now, tz);
    const l = localParts(now, tz);
    const cur = isoWeek(now, tz), prev = isoWeek(addDays(w0, -3, tz), tz);
    return [
      { key: cur, label: `Week ${weekNo(cur)}` },
      { key: prev, label: `Week ${weekNo(prev)}` },
      { key: `${l.y}-${String(l.m).padStart(2, "0")}`, label: monthName(l.m, lang) },
    ];
  }, [tz, lang]);

  const [opts, setOpts] = useState<Opts>(() => ({ period: periods[0].key, format: "csv", grouping: "day", ids: true, corrections: false, overtime: true, approvedOnly: true }));
  const [pv, setPv] = useState<Preview | null>(null);
  const [pvErr, setPvErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recent = useApi<Recent>("/api/admin/exports");
  const set = (p: Partial<Opts>) => setOpts((o) => ({ ...o, ...p }));

  useEffect(() => {
    let live = true;
    const h = setTimeout(() => {
      api<Preview>("/api/admin/exports?preview=1", { body: opts })
        .then((r) => { if (live) { setPv(r); setPvErr(null); } })
        .catch((e) => { if (live) setPvErr(errText(e, t)); });
    }, 120);
    return () => { live = false; clearTimeout(h); };
  }, [opts, t]);

  async function doExport() {
    setBusy(true);
    try {
      const res = await api<Response>("/api/admin/exports", { body: opts, raw: true });
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? pv?.fileName ?? "timo-export";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(`${t.tExport} ${name}`);
      recent.reload();
    } catch (e) {
      toast(errText(e, t), { error: true });
    } finally { setBusy(false); }
  }

  const cell = (h: string, v: string | number) => (typeof v === "number" && HOURS_COLS.has(h) ? num(v, "en", 2) : String(v));
  const include: [keyof Opts, string][] = [["ids", t.fLoc], ["corrections", t.fCorr], ["overtime", t.fOver], ["approvedOnly", t.fOnly]];

  return (
    <>
      <PageHead kicker={t.kick[3]} title={t.nav[3]} />
      <div style={{ display: "grid", gridTemplateColumns: "380px minmax(0,1fr)", gap: 28, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="lbl">{t.period}</div>
            <div className="seg" style={{ gridTemplateColumns: "repeat(3,1fr)" }} role="radiogroup" aria-label={t.period}>
              {periods.map((p) => (
                <button key={p.key} role="radio" aria-checked={opts.period === p.key} className={opts.period === p.key ? "on" : ""} onClick={() => set({ period: p.key })}>{p.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="lbl">{t.format}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }} role="radiogroup" aria-label={t.format}>
              {FORMATS.map(([k, label]) => {
                const on = opts.format === k;
                return (
                  <button
                    key={k} role="radio" aria-checked={on} onClick={() => set({ format: k })} className="fmt"
                    style={{ position: "relative", padding: "10px 12px", border: `1px solid ${on ? "var(--accent)" : "var(--divider)"}`, background: on ? "var(--accent-100)" : "transparent", textAlign: "left", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", gap: 1 }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{t.fmtSub[k]}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} role="radiogroup" aria-label={t.rows}>
            <div className="lbl">{t.rows}</div>
            {([["registration", t.gReg], ["day", t.gDay], ["period", t.gEmp]] as [Grouping, string][]).map(([k, label]) => {
              const on = opts.grouping === k;
              return (
                <button key={k} role="radio" aria-checked={on} onClick={() => set({ grouping: k })} className="opt">
                  <span style={{ width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${on ? "var(--accent)" : "var(--neutral-500)"}`, boxShadow: "inset 0 0 0 3px var(--bg)", background: on ? "var(--accent)" : "transparent", flex: "none" }} />
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="lbl">{t.include}</div>
            {include.map(([k, label]) => {
              const on = !!opts[k];
              return (
                <button key={k} role="checkbox" aria-checked={on} onClick={() => set({ [k]: !on } as Partial<Opts>)} className="opt">
                  <span style={{ width: 16, height: 16, border: `1.5px solid ${on ? "var(--accent)" : "var(--neutral-500)"}`, background: on ? "var(--accent)" : "transparent", color: "var(--bg)", display: "grid", placeItems: "center", flex: "none" }}>
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
          <button className="btn btn-p btn-xl" onClick={doExport} disabled={busy || !pv || pv.total === 0}>
            {busy ? <Loader2 size={18} className="spin" /> : <Download size={18} strokeWidth={1.5} />}
            {t.export} · {pv?.total ?? "…"} {t.exportN}<Bp />
          </button>
          {opts.approvedOnly && !!pv?.unapprovedExcluded && (
            <div className="info"><Info size={16} strokeWidth={1.5} />{fill(t.unapproved, { n: pv.unapprovedExcluded })}</div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div className="h2">{t.preview}</div>
            <div className="mono muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pv?.fileName ?? ""}</div>
          </div>
          {pvErr && <div className="err">{pvErr}</div>}
          <div className="card" style={{ overflowX: "auto" }}>
            <Bp />
            <table className="mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap" }}>
              <thead>
                <tr>{(pv?.header ?? []).map((h) => <th key={h} style={{ textAlign: "left", padding: "8px 10px", background: "var(--surface)", fontWeight: 600, borderBottom: "1px solid var(--divider)" }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {(pv?.rows ?? []).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--divider-soft)" }}>
                    {r.map((c, j) => <td key={j} style={{ padding: "7px 10px" }}>{cell(pv!.header[j], c)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {pv && pv.rows.length === 0 && <div className="help" style={{ padding: "12px 10px", fontFamily: "var(--font-body)" }}>{t.noRows}</div>}
          </div>
          <div className="help">{pv ? `+ ${Math.max(0, pv.total - pv.rows.length)} ${t.more}` : ""}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            <div className="lbl">{t.recent}</div>
            {recent.data?.recent.length === 0 && <div className="help" style={{ padding: "8px 0", borderTop: "1px solid var(--divider)" }}>{t.noRecent}</div>}
            {recent.data?.recent.map((r) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "18px 1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--divider)", fontSize: 13 }}>
                <FileSpreadsheet size={16} strokeWidth={1.5} style={{ color: "var(--accent-700)" }} />
                <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.fileName}</span>
                <span className="muted">{dayMon(r.createdAt, lang, tz)}{r.by ? ` · ${r.by}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
