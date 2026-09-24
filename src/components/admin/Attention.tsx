"use client";
import { useState } from "react";
import { ArrowRight, CircleCheck, Send } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { hm, shortDay } from "@/lib/i18n";
import { api, errText } from "@/lib/fetcher";
import { Bp } from "@/components/ui/Bp";
import { PageHead } from "@/components/ui/PageHead";
import { LoadState } from "@/components/ui/LoadState";
import { useApi } from "@/components/ui/hooks";
import { useToast } from "@/components/ui/Toast";
import { useAdmin } from "./AdminShell";

type Missing = { id: string; name: string; team: string | null; location: string; spot: string | null; checkInAt: string; checkOutAt: string | null; timezone: string };
type Correction = { id: string; name: string; type: string; note: string | null; location: string; recordedIn: string | null; recordedOut: string | null; requestedIn: string; requestedOut: string; timezone: string };
type Data = { missing: Missing[]; corrections: Correction[] };

export function Attention() {
  const { t, lang } = useI18n();
  const { refreshCounts } = useAdmin();
  const toast = useToast();
  const { data, error, reload } = useApi<Data>("/api/admin/attention", { poll: 30_000 });
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<unknown>, msg: string, refresh = true) {
    setBusy(key);
    try {
      await fn();
      toast(msg);
      if (refresh) { await reload(); refreshCounts(); }
    } catch (e) {
      toast(errText(e, t), { error: true });
    } finally { setBusy(null); }
  }

  const empty = data && data.missing.length === 0 && data.corrections.length === 0;

  return (
    <>
      <PageHead kicker={t.kick[2]} title={t.nav[2]} />
      {!data ? <LoadState error={error} onRetry={reload} /> : empty ? (
        <div className="empty"><CircleCheck size={22} strokeWidth={1.5} />{t.allClear}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 24, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="h2">{t.missingOut} <span className="h2-n">{data.missing.length}</span></div>
            <div className="help">{t.missingOutHelp}</div>
            {data.missing.length === 0 && <div className="help" style={{ padding: "6px 0" }}>{t.noneHere}</div>}
            {data.missing.map((m) => {
              const val = vals[m.id] ?? "";
              return (
                <div key={m.id} className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <Bp />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{m.name}</div>
                      <div className="help">{shortDay(m.checkInAt, lang, m.timezone)} · {m.location}{m.spot ? ` · ${m.spot}` : ""}</div>
                    </div>
                    <div className="cond tnum" style={{ fontSize: 22, whiteSpace: "nowrap" }}>{hm(m.checkInAt, m.timezone)} – {m.checkOutAt ? hm(m.checkOutAt, m.timezone) : "23:59"}</div>
                  </div>
                  <form
                    style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!val) return;
                      act(`s${m.id}`, () => api(`/api/admin/registrations/${m.id}`, { method: "PATCH", body: { checkOut: val } }), `${t.tSaved} — ${m.name}, ${val}`);
                    }}
                  >
                    <label className="help" htmlFor={`co-${m.id}`}>{t.setOut}</label>
                    <input id={`co-${m.id}`} type="time" className="inp h32" value={val} onChange={(e) => setVals({ ...vals, [m.id]: e.target.value })} required />
                    <button type="submit" className="btn btn-p btn-sm" disabled={!val || busy === `s${m.id}`}>{t.save}</button>
                    <button
                      type="button"
                      className="btn btn-s btn-sm"
                      disabled={busy === `a${m.id}`}
                      onClick={() => act(`a${m.id}`, () => api(`/api/admin/registrations/${m.id}/ask`, { method: "POST" }), `${t.tAsked} ${m.name}`, false)}
                    >
                      <Send size={14} strokeWidth={1.5} />{t.askEmp}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="h2">{t.corrReqs} <span className="h2-n">{data.corrections.length}</span></div>
            <div className="help">{t.corrHelp}</div>
            {data.corrections.length === 0 && <div className="help" style={{ padding: "6px 0" }}>{t.noneHere}</div>}
            {data.corrections.map((c) => {
              const tz = c.timezone;
              const from = c.recordedIn ? `${hm(c.recordedIn, tz)} – ${c.recordedOut ? hm(c.recordedOut, tz) : "…"}` : "—";
              return (
                <div key={c.id} className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <Bp />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
                    <div className="help">{shortDay(c.recordedIn ?? c.requestedIn, lang, tz)} · {c.location}</div>
                  </div>
                  <div className="tnum" style={{ display: "grid", gridTemplateColumns: "1fr 20px 1fr", alignItems: "center", gap: 8 }}>
                    <div><div className="lbl11">{t.recorded}</div><div style={{ fontSize: 16, color: "var(--muted)", textDecoration: c.recordedIn ? "line-through" : undefined }}>{from}</div></div>
                    <ArrowRight size={16} strokeWidth={1.5} style={{ color: "var(--accent-700)" }} />
                    <div><div className="lbl11">{t.requested}</div><div style={{ fontSize: 16, fontWeight: 600 }}>{hm(c.requestedIn, tz)} – {hm(c.requestedOut, tz)}</div></div>
                  </div>
                  {c.note && <div className="note">“{c.note}”</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-p btn-sm" disabled={!!busy} onClick={() => act(`c${c.id}`, () => api(`/api/admin/corrections/${c.id}/approve`, { method: "POST" }), `${t.tCorrA} — ${c.name}`)}>{t.approve}</button>
                    <button className="btn btn-s btn-sm" disabled={!!busy} onClick={() => act(`d${c.id}`, () => api(`/api/admin/corrections/${c.id}/decline`, { method: "POST" }), `${t.tCorrD} — ${c.name}`)}>{t.decline}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
