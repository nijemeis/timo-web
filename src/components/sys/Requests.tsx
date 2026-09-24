"use client";
import { useState } from "react";
import { CircleCheck, Loader2, Truck } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { dayMon, minorRange } from "@/lib/i18n";
import { api, errText } from "@/lib/fetcher";
import { Bp } from "@/components/ui/Bp";
import { PageHead } from "@/components/ui/PageHead";
import { Tag } from "@/components/ui/Tag";
import { LoadState } from "@/components/ui/LoadState";
import { useApi } from "@/components/ui/hooks";
import { useToast } from "@/components/ui/Toast";
import { SysKpis, useSys } from "./SysShell";

type Req = {
  id: string; ref: string; createdAt: string; company: string; major: number; location: string | null; requestedBy: string | null;
  quantity: number; note: string | null; status: "requested" | "shipped" | "delivered"; assignedMinors: number[]; nextMinors: { from: number; to: number } | null;
};

const TZ = "Europe/Amsterdam";

export function Requests() {
  const { t, lang } = useI18n();
  const { refreshStats } = useSys();
  const toast = useToast();
  const { data, error, reload } = useApi<{ requests: Req[] }>("/api/sys/requests", { poll: 60_000 });
  const [busy, setBusy] = useState<string | null>(null);

  const open = data?.requests.filter((r) => r.status === "requested") ?? [];
  const done = data?.requests.filter((r) => r.status !== "requested") ?? [];

  async function run(r: Req, action: "fulfil" | "deliver") {
    setBusy(r.id + action);
    try {
      const res = await api<{ minors?: number[] }>(`/api/sys/requests/${r.id}/${action}`, { method: "POST" });
      toast(action === "fulfil" ? `${t.tShip} ${r.company}, minor ${minorRange(res.minors ?? [])}` : `${t.tDelivered} ${r.ref} · ${r.company}`);
      await reload(); refreshStats();
    } catch (e) { toast(errText(e, t), { error: true }); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHead kicker={t.sysKick[2]} title={t.sysNav[2]} />
      <SysKpis />
      {!data ? <LoadState error={error} onRetry={reload} /> : (
        <>
          {open.length === 0 && <div style={{ padding: "16px 0", color: "var(--muted)", fontSize: 15, display: "flex", gap: 10, alignItems: "center" }}><CircleCheck size={20} strokeWidth={1.5} style={{ color: "var(--accent-700)" }} />{t.noReqs}</div>}
          {open.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 20 }}>
              {open.map((r) => {
                const range = r.nextMinors ? (r.nextMinors.from === r.nextMinors.to ? String(r.nextMinors.from) : `${r.nextMinors.from}–${r.nextMinors.to}`) : "—";
                return (
                  <div key={r.id} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                    <Bp />
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="mono muted" style={{ fontSize: 12 }}>{r.ref} · {dayMon(r.createdAt, lang, TZ)}</div>
                        <div style={{ fontWeight: 600, fontSize: 16 }}>{r.company} <span className="mono muted" style={{ fontSize: 12, fontWeight: 400 }}>major {r.major}</span></div>
                        <div className="help">{[r.location, r.requestedBy].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                      <div className="cond" style={{ fontSize: 34, lineHeight: 1 }}>{r.quantity}<span style={{ fontSize: 15, color: "var(--muted)", fontWeight: 500 }}> ×</span></div>
                    </div>
                    {r.note && <div className="note">“{r.note}”</div>}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
                      <div><div className="lbl11">{t.nextMinors}</div><div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{range}</div></div>
                      <button className="btn btn-p btn-md" disabled={!!busy} onClick={() => run(r, "fulfil")}>
                        {busy === r.id + "fulfil" ? <Loader2 size={16} className="spin" /> : <Truck size={16} strokeWidth={1.5} />}{t.progShip}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="lbl">{t.handled}</div>
            {done.length === 0 && <div className="help" style={{ padding: "9px 0", borderTop: "1px solid var(--divider)" }}>{t.noHandled}</div>}
            {done.map((r) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "90px minmax(0,1fr) auto auto auto", gap: 12, alignItems: "center", padding: "9px 0", borderTop: "1px solid var(--divider)", fontSize: 13 }}>
                <span className="mono muted">{r.ref}</span>
                <span><span style={{ fontWeight: 600 }}>{r.company}</span> · {r.quantity} ×{r.location ? ` ${r.location}` : ""}</span>
                <span className="mono">minor {minorRange(r.assignedMinors)}</span>
                {r.status === "shipped"
                  ? <button className="btn btn-light btn-xs" disabled={!!busy} onClick={() => run(r, "deliver")}>{t.markDelivered}</button>
                  : <span />}
                {r.status === "shipped" ? <Tag kind="ready">{t.stShippedR}</Tag> : <Tag kind="ok">{t.stDelivered}</Tag>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
