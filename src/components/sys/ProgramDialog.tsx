"use client";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api, errText } from "@/lib/fetcher";
import { Bp } from "@/components/ui/Bp";
import { Dialog } from "@/components/ui/Dialog";
import type { Company } from "./types";

type Preview = { major: number; from: number; to: number };

/** Program beacons: pick the company, a quantity, and see the UUID / major / next minors before writing them. */
export function ProgramDialog({ companies, uuid, initialId, onClose, onDone }: { companies: Company[]; uuid: string; initialId?: string; onClose: () => void; onDone: (r: { major: number; minors: number[] }) => void }) {
  const { t } = useI18n();
  const [id, setId] = useState(initialId ?? companies[0]?.id ?? "");
  const [qty, setQty] = useState("2");
  const [pv, setPv] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = Math.floor(Number(qty));
  const ok = n >= 1 && n <= 500;

  useEffect(() => {
    if (!id || !ok) { setPv(null); return; }
    let live = true;
    const h = setTimeout(() => {
      api<Preview>(`/api/sys/beacons/program?companyId=${encodeURIComponent(id)}&qty=${n}`).then((r) => live && setPv(r)).catch(() => live && setPv(null));
    }, 120);
    return () => { live = false; clearTimeout(h); };
  }, [id, n, ok]);

  async function program() {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ major: number; minors: number[] }>("/api/sys/beacons/program", { body: { companyId: id, qty: n } });
      onDone(r);
    } catch (e) { setErr(errText(e, t)); setBusy(false); }
  }

  const minors = pv ? (pv.from === pv.to ? String(pv.from) : `${pv.from}–${pv.to}`) : "—";
  return (
    <Dialog title={t.program} onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 12 }}>
        <div className="field">{t.company}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} role="radiogroup" aria-label={t.company}>
            {companies.map((c) => (
              <button key={c.id} role="radio" aria-checked={id === c.id} className={`chip${id === c.id ? " on" : ""}`} style={{ height: 30, padding: "0 10px" }} onClick={() => setId(c.id)}>
                {c.major} · {c.name}
              </button>
            ))}
          </div>
        </div>
        <label className="field">{t.qtyS}<input className="inp" type="number" min={1} max={500} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
      </div>
      <div className="card mono" style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, fontSize: 13 }}>
        <Bp />
        <div><div className="lbl11" style={{ fontFamily: "var(--font-body)" }}>UUID</div>{uuid ? `${uuid.slice(0, 8)}…` : "…"}</div>
        <div><div className="lbl11" style={{ fontFamily: "var(--font-body)" }}>Major</div>{pv?.major ?? companies.find((c) => c.id === id)?.major ?? "—"}</div>
        <div><div className="lbl11" style={{ fontFamily: "var(--font-body)" }}>Minor</div>{minors}</div>
      </div>
      <div className="help" style={{ display: "flex", gap: 8 }}><Info size={16} strokeWidth={1.5} style={{ flex: "none", marginTop: 1 }} />{t.progHelp}</div>
      {err && <div className="err">{err}</div>}
      <div className="actions">
        <button className="btn btn-s btn-md" onClick={onClose}>{t.cancel}</button>
        <button className="btn btn-p btn-md" style={{ padding: "0 16px" }} disabled={busy || !ok || !id} onClick={program}>{t.programBtn}</button>
      </div>
    </Dialog>
  );
}
