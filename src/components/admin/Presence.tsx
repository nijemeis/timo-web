"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { dur, fill, hm, longDay } from "@/lib/i18n";
import { Bp } from "@/components/ui/Bp";
import { PageHead } from "@/components/ui/PageHead";
import { useApi, useNow } from "@/components/ui/hooks";
import { LoadState } from "@/components/ui/LoadState";
import { useAdmin } from "./AdminShell";

type PresenceData = {
  now: string;
  kpi: { inNow: number; active: number; split: { short: string; n: number }[]; expected: { id: string; name: string; usualIn: string }[]; attention: number };
  locations: { id: string; name: string; short: string | null; capacity: number; inNow: number; minors: number[]; peak: number; peakAt: string | null }[];
  checkedIn: { id: string; name: string; team: string | null; locationId: string | null; location: string; spot: string | null; since: string }[];
  events: { id: string; at: string; type: "enter" | "exit"; name: string; location: string; spot: string; minor: number }[];
};

/** "08:29" → "09:00": the hour everyone expected is usually in by. */
function ceilHour(times: string[]) {
  let max = 0;
  for (const s of times) { const [h, m] = s.split(":").map(Number); max = Math.max(max, h * 60 + m); }
  const h = Math.min(23, Math.ceil(max / 60));
  return `${String(h).padStart(2, "0")}:00`;
}

export function Presence() {
  const { t, lang } = useI18n();
  const { tz } = useAdmin();
  const router = useRouter();
  const now = useNow(1000);
  const { data, error, reload } = useApi<PresenceData>("/api/admin/presence", { poll: 15_000 });
  const [locF, setLocF] = useState<string | null>(null);

  const present = useMemo(() => (data?.checkedIn ?? []).filter((r) => !locF || r.locationId === locF), [data, locF]);
  const locName = data?.locations.find((l) => l.id === locF)?.name;

  return (
    <>
      <PageHead kicker={longDay(new Date(now), lang, tz)} title={t.nav[0]}>
        <div className="live"><span className="sq" />{t.live} · {hm(new Date(now), tz)}</div>
      </PageHead>
      {!data ? <LoadState error={error} onRetry={reload} /> : (
        <>
          <div className="kpis" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
            <button className="kpi" onClick={() => setLocF(null)}>
              <span className="kicker">{t.inNowK}</span>
              <span className="v">{data.kpi.inNow}<small> {t.ofActive} {data.kpi.active}</small></span>
              <span className="s">{data.kpi.split.map((s) => `${s.short} ${s.n}`).join(" · ") || "—"}</span>
            </button>
            <button className="kpi" onClick={() => router.push("/admin/people")}>
              <span className="kicker">{t.notYet}</span>
              <span className="v">{data.kpi.expected.length}</span>
              <span className="s">
                {data.kpi.expected.length
                  ? `${data.kpi.expected.map((e) => e.name).join(", ")} · ${fill(t.notYetSub, { t: ceilHour(data.kpi.expected.map((e) => e.usualIn)) })}`
                  : t.notYetNone}
              </span>
            </button>
            <button className="kpi" onClick={() => router.push("/admin/attention")}>
              <span className="kicker">{t.attnK}</span>
              <span className="v">{data.kpi.attention}</span>
              <span className="s">{t.attnSub}</span>
            </button>
          </div>

          {data.locations.length === 0 ? (
            <div className="help" style={{ fontSize: 14 }}>{t.noLocations}</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 20 }}>
              {data.locations.map((l) => {
                const pct = l.capacity ? Math.round((l.inNow / l.capacity) * 100) : 0;
                return (
                  <button
                    key={l.id}
                    onClick={() => setLocF(locF === l.id ? null : l.id)}
                    aria-pressed={locF === l.id}
                    className="loc-card"
                    style={{ position: "relative", padding: 16, border: `1px solid ${locF === l.id ? "var(--accent)" : "var(--divider)"}`, background: "transparent", textAlign: "left", cursor: "pointer", color: "var(--text)", display: "flex", flexDirection: "column", gap: 10 }}
                  >
                    <Bp />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 16 }}>{l.name}</span>
                      <span className="mono" style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{l.minors.length ? `minor ${l.minors.join(" · ")}` : ""}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span className="cond tnum" style={{ fontSize: 34, lineHeight: 1 }}>{l.inNow}</span>
                      <span className="muted">/ {l.capacity} {t.desks}</span>
                    </div>
                    <div className="bar"><div style={{ width: `${Math.min(100, pct)}%` }} /></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)", gap: 8 }}>
                      <span>{pct}% {t.occupied}</span>
                      <span>{t.peak} {l.peakAt ? `${l.peakAt} · ${l.peak}` : "—"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 24, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="h2">{t.inNow} <span className="h2-n">{present.length}</span></div>
                {locF && (
                  <button className="chip on" style={{ height: 28, padding: "0 10px", borderRadius: 0 }} onClick={() => setLocF(null)}>
                    {locName}<X size={14} strokeWidth={1.5} />
                  </button>
                )}
              </div>
              <table className="tbl">
                <thead>
                  <tr><th>{t.employee}</th><th>{t.location}</th><th>{t.since}</th><th className="r">{t.duration}</th></tr>
                </thead>
                <tbody>
                  {present.map((r) => (
                    <tr key={r.id}>
                      <td><div className="b">{r.name}</div><div className="sub">{r.team ?? ""}</div></td>
                      <td>{r.location}<div className="sub">{r.spot ?? ""}</div></td>
                      <td className="tnum">{hm(r.since, tz)}</td>
                      <td className="r tnum b">{dur(now - new Date(r.since).getTime(), lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {present.length === 0 && <div className="help" style={{ padding: "10px 0", fontSize: 14 }}>{t.nobodyIn}</div>}
            </div>
            <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
              <Bp />
              <div className="cond" style={{ fontSize: 20, paddingBottom: 6 }}>{t.feed}</div>
              {data.events.length === 0 && <div className="help" style={{ padding: "7px 0", borderTop: "1px solid var(--divider-soft)" }}>{t.feedEmpty}</div>}
              {data.events.slice(0, 12).map((f) => {
                const Icon = f.type === "enter" ? LogIn : LogOut;
                return (
                  <div key={f.id} style={{ display: "grid", gridTemplateColumns: "42px 18px 1fr", gap: 8, alignItems: "start", padding: "7px 0", borderTop: "1px solid var(--divider-soft)", fontSize: 13 }}>
                    <span className="tnum muted">{hm(f.at, tz)}</span>
                    <Icon size={16} strokeWidth={1.5} style={{ color: "var(--accent-700)", marginTop: 1 }} />
                    <span>
                      <span style={{ fontWeight: 600 }}>{f.name}</span>{" "}
                      <span className="muted">{f.type === "enter" ? t.evIn : t.evOut} {f.location}{f.spot ? `, ${f.spot}` : ""} ({f.minor})</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
