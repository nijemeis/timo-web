"use client";
import { useState } from "react";
import { Cpu, PackagePlus } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { minorRange } from "@/lib/i18n";
import { api, errText } from "@/lib/fetcher";
import { Bp } from "@/components/ui/Bp";
import { Dialog } from "@/components/ui/Dialog";
import { PageHead } from "@/components/ui/PageHead";
import { Tag, type TagKind } from "@/components/ui/Tag";
import { LoadState } from "@/components/ui/LoadState";
import { useApi } from "@/components/ui/hooks";
import { useToast } from "@/components/ui/Toast";
import { SysKpis, useSys } from "./SysShell";
import { ProgramDialog } from "./ProgramDialog";
import { minorStatus } from "./Companies";
import type { Company, Minor } from "./types";

type Beacon = { id: string; serial: string; major: number | null; minor: number | null; company: string | null; placedAt: string | null; firmware: string | null; battery: number | null; status: Minor["status"]; health: Minor["health"] };
type Data = { uuid: string; counts: { all: number; active: number; supplied: number; shipped: number; stock: number }; beacons: Beacon[] };
type Filter = "all" | "active" | "supplied" | "shipped" | "stock";

export function Inventory() {
  const { t } = useI18n();
  const { refreshStats } = useSys();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const { data, error, reload } = useApi<Data>(`/api/sys/beacons?status=${filter}`);
  const companies = useApi<{ companies: Company[] }>("/api/sys/companies");
  const [dlg, setDlg] = useState<null | "prog" | "stock">(null);
  const [busy, setBusy] = useState<string | null>(null);

  const tagKind = (b: Beacon): TagKind =>
    b.status === "active" ? (b.health === "low" || b.health === "offline" ? "alert" : "ok") : b.status === "stock" ? "stock" : "ready";
  const chips: [Filter, string][] = [["all", t.all], ["active", t.stInField], ["supplied", t.stSupplied], ["shipped", t.stShipped], ["stock", t.stStock]];
  const anyShipped = !!data?.beacons.some((b) => b.status === "shipped");

  async function deliver(b: Beacon) {
    setBusy(b.id);
    try {
      await api("/api/sys/beacons/deliver", { body: { ids: [b.id] } });
      toast(`${t.tDelivered} ${b.serial}`);
      await reload(); refreshStats();
    } catch (e) { toast(errText(e, t), { error: true }); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHead kicker={t.sysKick[1]} title={t.sysNav[1]}>
        <button className="btn btn-s btn-md" style={{ height: 38 }} onClick={() => setDlg("stock")}><PackagePlus size={16} strokeWidth={1.5} />{t.addStock}</button>
        <button className="btn btn-p btn-hero-l" style={{ marginLeft: 4 }} onClick={() => setDlg("prog")} disabled={!companies.data?.companies.length}><Cpu size={18} strokeWidth={1.5} />{t.program}<Bp /></button>
      </PageHead>
      <SysKpis />
      {!data ? <LoadState error={error} onRetry={reload} /> : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {chips.map(([k, label]) => (
              <button key={k} className={`chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)} aria-pressed={filter === k}>
                {label}<span className="n">{data.counts[k]}</span>
              </button>
            ))}
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>{t.serial}</th><th>Major</th><th>Minor</th><th>{t.company}</th><th>{t.placedAt}</th><th>Firmware</th><th className="r">{t.battery}</th><th>{t.status}</th>
                {anyShipped && <th />}
              </tr>
            </thead>
            <tbody>
              {data.beacons.map((b) => (
                <tr key={b.id}>
                  <td className="mono" style={{ fontSize: 13 }}>{b.serial}</td>
                  <td className="mono" style={{ fontSize: 13 }}>{b.major ?? "—"}</td>
                  <td className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{b.minor ?? "—"}</td>
                  <td>{b.company ?? "—"}</td>
                  <td className="muted">{b.placedAt ?? (b.major != null ? t.notPlaced : "—")}</td>
                  <td className="mono muted" style={{ fontSize: 12 }}>{b.firmware ?? "—"}</td>
                  <td className="r tnum">{b.battery == null || b.status === "stock" ? "—" : `${b.battery}%`}</td>
                  <td><Tag kind={tagKind(b)}>{minorStatus(b, t)}</Tag></td>
                  {anyShipped && (
                    <td className="r">
                      {b.status === "shipped" && <button className="btn btn-light btn-xs" disabled={busy === b.id} onClick={() => deliver(b)}>{t.markDelivered}</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {data.beacons.length === 0 && <div className="help" style={{ fontSize: 14 }}>—</div>}
        </>
      )}
      {dlg === "prog" && companies.data && (
        <ProgramDialog
          companies={companies.data.companies}
          uuid={data?.uuid ?? ""}
          onClose={() => setDlg(null)}
          onDone={(r) => { setDlg(null); toast(`${r.minors.length} ${t.tProg} ${r.major} — minor ${minorRange(r.minors)}`); reload(); companies.reload(); refreshStats(); }}
        />
      )}
      {dlg === "stock" && <StockDialog onClose={() => setDlg(null)} onDone={(n) => { setDlg(null); toast(`${n} ${t.tStock}`); reload(); refreshStats(); }} />}
    </>
  );
}

function StockDialog({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const { t } = useI18n();
  const [qty, setQty] = useState("6");
  const [serials, setSerials] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = serials.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const n = list.length || Math.floor(Number(qty));
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api<{ serials: string[] }>("/api/sys/beacons/stock", { body: { qty: n, ...(list.length ? { serials: list } : {}) } });
      onDone(r.serials.length);
    } catch (e2) { setErr(errText(e2, t)); setBusy(false); }
  }
  return (
    <Dialog title={t.addStock} onClose={onClose}>
      <form onSubmit={add} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label className="field" style={{ maxWidth: 140 }}>{t.qtyS}<input className="inp" type="number" min={1} max={500} value={list.length ? String(list.length) : qty} disabled={!!list.length} onChange={(e) => setQty(e.target.value)} /></label>
        <label className="field">{t.serialsL}<textarea className="inp mono" style={{ fontSize: 13 }} value={serials} placeholder="TB-26-05001" onChange={(e) => setSerials(e.target.value)} /></label>
        <div className="help">{t.stockHelp}</div>
        {err && <div className="err">{err}</div>}
        <div className="actions">
          <button type="button" className="btn btn-s btn-md" onClick={onClose}>{t.cancel}</button>
          <button type="submit" className="btn btn-p btn-md" style={{ padding: "0 16px" }} disabled={busy || !(n >= 1 && n <= 500)}>{t.addStock}</button>
        </div>
      </form>
    </Dialog>
  );
}
