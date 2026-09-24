"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info, MapPin, PackagePlus, PencilLine } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { dayMon, fill, minorRange, type Dict } from "@/lib/i18n";
import { api, errText } from "@/lib/fetcher";
import { Bp } from "@/components/ui/Bp";
import { Dialog } from "@/components/ui/Dialog";
import { PageHead } from "@/components/ui/PageHead";
import { Tag } from "@/components/ui/Tag";
import { LoadState } from "@/components/ui/LoadState";
import { useApi, useNow } from "@/components/ui/hooks";
import { useToast } from "@/components/ui/Toast";
import { useAdmin } from "./AdminShell";

type Loc = { id: string; name: string; short: string | null; capacity: number; timezone: string };
type Active = { id: string; serial: string; minor: number; location: string; spot: string | null; placement: "entrance" | "zone"; battery: number | null; lastSeenAt: string | null; eventsToday: number; health: "online" | "low" | "offline" | "unknown" };
type Supplied = { id: string; serial: string; minor: number; status: "supplied" | "shipped" };
type Req = { id: string; ref: string; quantity: number; location: string | null; note: string | null; status: "requested" | "shipped" | "delivered"; assignedMinors: number[]; createdAt: string; requestedBy: string | null };
type Data = { uuid: string; major: number; minors: number[]; locations: Loc[]; active: Active[]; supplied: Supplied[]; requests: Req[] };

function ago(iso: string | null, now: number, t: Dict) {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} ${t.sec}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${t.min}`;
  return `${Math.floor(m / 60)} ${t.hr} ${m % 60} ${t.min}`;
}

export function Beacons() {
  const { t, lang } = useI18n();
  const { company, isAdmin, tz } = useAdmin();
  const toast = useToast();
  const router = useRouter();
  const now = useNow(5000);
  const { data, error, reload } = useApi<Data>("/api/admin/beacons", { poll: 30_000 });
  const [draft, setDraft] = useState<Record<string, { locationId?: string; spot: string; placement: "entrance" | "zone" }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [locEdit, setLocEdit] = useState<Loc | "new" | null>(null);

  const health = (h: Active["health"]) =>
    h === "online" ? <Tag kind="ok">{t.online}</Tag> : h === "low" ? <Tag kind="ready">{t.lowBat}</Tag> : h === "offline" ? <Tag kind="alert">{t.offline}</Tag> : <Tag kind="stock">{t.notSeen}</Tag>;
  const reqTag = (s: Req["status"]) => (s === "delivered" ? <Tag kind="ok">{t.stDone}</Tag> : <Tag kind="ready">{s === "shipped" ? t.stShip : t.stReq}</Tag>);

  async function activate(b: Supplied) {
    if (!data) return;
    const d = draft[b.id] ?? { spot: "", placement: "entrance" as const };
    const locationId = d.locationId ?? data.locations[0]?.id;
    if (!locationId || !d.spot.trim()) return;
    setBusy(b.id);
    try {
      await api(`/api/admin/beacons/${b.id}`, { method: "PATCH", body: { locationId, spot: d.spot.trim(), placement: d.placement } });
      toast(`${t.tAct} ${b.minor} · ${data.locations.find((l) => l.id === locationId)?.name ?? ""}`);
      await reload();
    } catch (e) { toast(errText(e, t), { error: true }); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHead kicker={t.kick[4]} title={t.nav[4]} />
      {!data ? <LoadState error={error} onRetry={reload} /> : (
        <>
          <div className="kpis" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
            <div className="kpi" style={{ padding: "14px 16px", gap: 0 }}>
              <div className="lbl">Proximity UUID</div>
              <div className="mono" style={{ fontSize: 13, marginTop: 4, wordBreak: "break-all" }}>{data.uuid}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{t.uuidHelp}</div>
            </div>
            <div className="kpi" style={{ padding: "14px 16px", gap: 0 }}>
              <div className="lbl">Major</div>
              <div className="cond" style={{ fontSize: 28, lineHeight: 1.1 }}>{data.major}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{fill(t.majorHelp, { c: company.name })}</div>
            </div>
            <div className="kpi" style={{ padding: "14px 16px", gap: 0 }}>
              <div className="lbl">Minor</div>
              <div className="cond" style={{ fontSize: 28, lineHeight: 1.1 }}>{data.minors.length ? [...data.minors].sort((a, b) => a - b).join(" · ") : "—"}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.minorHelp}</div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div className="h2">{t.beacons} <span className="h2-n">{data.active.length}</span></div>
            {isAdmin && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="btn btn-s btn-md" onClick={() => setLocEdit("new")}><MapPin size={16} strokeWidth={1.5} />{t.addLocation}</button>
                <button className="btn btn-p btn-hero" onClick={() => setReqOpen(true)}><PackagePlus size={17} strokeWidth={1.5} />{t.reqBeacons}<Bp /></button>
              </div>
            )}
          </div>
          <table className="tbl">
            <thead>
              <tr><th>{t.location}</th><th>Minor</th><th>{t.role2}</th><th style={{ width: 170 }}>{t.battery}</th><th>{t.lastSeen}</th><th>{t.today2}</th><th>{t.status}</th></tr>
            </thead>
            <tbody>
              {data.active.map((b) => (
                <tr key={b.id}>
                  <td style={{ padding: "10px 8px 10px 0" }}><div className="b">{b.location}</div><div className="sub">{b.spot ?? ""}</div></td>
                  <td className="mono">{b.minor}</td>
                  <td className="muted">{b.placement === "entrance" ? t.entry : t.zone}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="bar" style={{ flex: 1 }}><div style={{ width: `${b.battery ?? 0}%`, background: (b.battery ?? 0) < 20 ? "var(--accent-900)" : "var(--accent)" }} /></div>
                      <span className="tnum" style={{ width: 34, textAlign: "right" }}>{b.battery == null ? "—" : `${b.battery}%`}</span>
                    </div>
                  </td>
                  <td className="tnum">{ago(b.lastSeenAt, now, t)}</td>
                  <td className="tnum">{b.eventsToday}</td>
                  <td>{health(b.health)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.active.length === 0 && <div className="help" style={{ fontSize: 14 }}>{t.noBeaconsYet}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 24, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="h2">{t.spareT} <span className="h2-n">{data.supplied.length}</span></div>
              <div className="help">{t.spareHelp}</div>
              {data.supplied.length === 0 && <div className="muted" style={{ fontSize: 14, padding: "10px 0" }}>{t.noSpare}</div>}
              {isAdmin && data.supplied.length > 0 && data.locations.length === 0 && <div className="info"><Info size={16} strokeWidth={1.5} />{t.needLocation}</div>}
              {data.supplied.map((b) => {
                const d = draft[b.id] ?? { spot: "", placement: "entrance" as const };
                const upd = (p: Partial<typeof d>) => setDraft({ ...draft, [b.id]: { ...d, ...p } });
                return (
                  <div key={b.id} className="card" style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: isAdmin ? "86px minmax(0,1fr) minmax(0,1fr) 110px auto" : "86px 1fr", gap: 10, alignItems: "end" }}>
                    <Bp />
                    <div>
                      <div className="lbl11">Minor</div>
                      <div className="cond" style={{ fontSize: 26, lineHeight: 1.1 }}>{b.minor}</div>
                      <div className="mono muted" style={{ fontSize: 11 }}>{b.serial}</div>
                    </div>
                    {isAdmin ? (
                      <>
                        <label className="field tight">{t.location}
                          <select className="inp h34" value={d.locationId ?? data.locations[0]?.id ?? ""} onChange={(e) => upd({ locationId: e.target.value })} disabled={!data.locations.length}>
                            {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        </label>
                        <label className="field tight">{t.spotL}
                          <input className="inp h34" value={d.spot} placeholder={t.spotPh} onChange={(e) => upd({ spot: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") activate(b); }} />
                        </label>
                        <label className="field tight">{t.role2}
                          <select className="inp h34" value={d.placement} onChange={(e) => upd({ placement: e.target.value as "entrance" | "zone" })}>
                            <option value="entrance">{t.entry}</option>
                            <option value="zone">{t.zone}</option>
                          </select>
                        </label>
                        <button className="btn btn-p" style={{ height: 34, padding: "0 12px", fontSize: 13 }} disabled={!d.spot.trim() || !data.locations.length || busy === b.id} onClick={() => activate(b)}>{t.activate}</button>
                      </>
                    ) : (
                      <div style={{ alignSelf: "center" }}>{b.status === "shipped" ? <Tag kind="ready">{t.shippedNote}</Tag> : <Tag kind="ready">{t.stDone}</Tag>}</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="h2">{t.locationsT}</div>
              <div>
                {data.locations.map((l) => (
                  <div key={l.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--divider)" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{l.name}</div>
                      <div className="help">{l.short ? `${l.short} · ` : ""}{l.capacity} {t.desks}</div>
                    </div>
                    {isAdmin && <button className="iconbtn" onClick={() => setLocEdit(l)} aria-label={`${t.editLocation}: ${l.name}`} title={t.editLocation}><PencilLine size={16} strokeWidth={1.5} /></button>}
                  </div>
                ))}
                {data.locations.length === 0 && <div className="help" style={{ padding: "8px 0", borderTop: "1px solid var(--divider)" }}>{t.noLocations}</div>}
              </div>
              <div className="h2" style={{ marginTop: 14 }}>{t.reqsT}</div>
              <div>
                {data.requests.length === 0 && <div className="help" style={{ padding: "10px 0", borderTop: "1px solid var(--divider)" }}>{t.noReqsYet}</div>}
                {data.requests.map((r) => (
                  <div key={r.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "4px 12px", padding: "10px 0", borderTop: "1px solid var(--divider)" }}>
                    <div style={{ fontWeight: 600 }}>{r.ref} · {r.quantity} {r.location ? `${r.quantity === 1 ? t.beaconN : t.beaconsN} ${r.location}` : t.beaconsAny}</div>
                    <span style={{ justifySelf: "end" }}>{reqTag(r.status)}</span>
                    <div className="help" style={{ gridColumn: "1 / -1" }}>
                      {dayMon(r.createdAt, lang, tz)}{r.requestedBy ? ` · ${t.reqBy} ${r.requestedBy}` : ""}{r.assignedMinors.length ? ` · minor ${minorRange(r.assignedMinors)}` : ""}{r.note ? ` · “${r.note}”` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {reqOpen && <RequestDialog data={data} onClose={() => setReqOpen(false)} onDone={() => { setReqOpen(false); toast(t.tReq); reload(); }} />}
          {locEdit && (
            <LocationDialog
              loc={locEdit === "new" ? null : locEdit}
              onClose={() => setLocEdit(null)}
              onDone={(isNew) => { setLocEdit(null); toast(isNew ? t.tLocAdded : t.tLocSaved); reload(); router.refresh(); }}
            />
          )}
        </>
      )}
    </>
  );
}

function RequestDialog({ data, onClose, onDone }: { data: Data; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [qty, setQty] = useState("1");
  const [loc, setLoc] = useState(data.locations[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = Math.floor(Number(qty));
  async function send() {
    setBusy(true); setErr(null);
    try {
      await api("/api/admin/beacon-requests", { body: { quantity: n, locationId: loc || null, note: note.trim() || null } });
      onDone();
    } catch (e) { setErr(errText(e, t)); setBusy(false); }
  }
  return (
    <Dialog title={t.reqBeacons} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12 }}>
        <label className="field">{t.qty}<input className="inp" type="number" min={1} max={200} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label className="field">{t.forLoc}
          <select className="inp" value={loc} onChange={(e) => setLoc(e.target.value)}>
            {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            <option value="">{t.anyLoc}</option>
          </select>
        </label>
      </div>
      <label className="field">{t.reqNote}<textarea className="inp" style={{ minHeight: 72 }} value={note} placeholder={t.reqNotePh} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
      <div className="help" style={{ display: "flex", gap: 8 }}><Info size={16} strokeWidth={1.5} style={{ flex: "none", marginTop: 1 }} />{fill(t.reqHelp, { m: data.major })}</div>
      {err && <div className="err">{err}</div>}
      <div className="actions">
        <button className="btn btn-s btn-md" onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-p btn-md" style={{ padding: "0 16px" }} disabled={busy || !(n >= 1 && n <= 200)} onClick={send}>{t.sendReq}</button>
      </div>
    </Dialog>
  );
}

function LocationDialog({ loc, onClose, onDone }: { loc: Loc | null; onClose: () => void; onDone: (isNew: boolean) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(loc?.name ?? "");
  const [short, setShort] = useState(loc?.short ?? "");
  const [cap, setCap] = useState(String(loc?.capacity ?? 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const capN = Math.floor(Number(cap));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body = { name: name.trim(), short: short.trim() || null, capacity: capN };
      if (loc) await api(`/api/admin/locations/${loc.id}`, { method: "PATCH", body });
      else await api("/api/admin/locations", { body });
      onDone(!loc);
    } catch (e2) { setErr(errText(e2, t)); setBusy(false); }
  }
  return (
    <Dialog title={loc ? t.editLocation : t.addLocation} onClose={onClose}>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label className="field">{t.locName}<input className="inp" autoFocus value={name} placeholder={t.locNamePh} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label className="field">{t.locShort}<input className="inp" value={short} placeholder={t.locShortPh} onChange={(e) => setShort(e.target.value.slice(0, 8))} /></label>
          <label className="field">{t.capacity}<input className="inp" type="number" min={1} max={10000} value={cap} onChange={(e) => setCap(e.target.value)} /></label>
        </div>
        <div className="help">{t.locShortHelp}</div>
        {err && <div className="err">{err}</div>}
        <div className="actions">
          <button type="button" className="btn btn-s btn-md" onClick={onClose}>{t.cancel}</button>
          <button type="submit" className="btn btn-p btn-md" style={{ padding: "0 16px" }} disabled={busy || name.trim().length < 2 || !(capN >= 1)}>{t.save}</button>
        </div>
      </form>
    </Dialog>
  );
}
