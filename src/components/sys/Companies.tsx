"use client";
import { useState } from "react";
import { Building2, Cpu, Info, Settings } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { fill, minorRange, monYear, type Dict } from "@/lib/i18n";
import { api, errText } from "@/lib/fetcher";
import { Bp } from "@/components/ui/Bp";
import { Dialog } from "@/components/ui/Dialog";
import { PageHead } from "@/components/ui/PageHead";
import { Tag } from "@/components/ui/Tag";
import { LoadState } from "@/components/ui/LoadState";
import { useApi } from "@/components/ui/hooks";
import { useToast } from "@/components/ui/Toast";
import { SysKpis, useSys } from "./SysShell";
import { ProgramDialog } from "./ProgramDialog";
import type { Company, Minor } from "./types";

const TZ = "Europe/Amsterdam";

export function minorStatus(m: Pick<Minor, "status" | "health">, t: Dict) {
  if (m.status === "active") return m.health === "low" ? t.stLow : m.health === "offline" ? t.stOffline : t.stInField;
  return m.status === "supplied" ? t.stSupplied : m.status === "shipped" ? t.stShipped : t.stStock;
}

export function Companies() {
  const { t, lang } = useI18n();
  const { stats, refreshStats } = useSys();
  const toast = useToast();
  const { data, error, reload } = useApi<{ companies: Company[] }>("/api/sys/companies");
  const [selId, setSelId] = useState<string | null>(null);
  const [dlg, setDlg] = useState<null | "reg" | "prog" | "settings">(null);

  const list = data?.companies ?? [];
  const sel = list.find((c) => c.id === selId) ?? list[0];

  return (
    <>
      <PageHead kicker={t.sysKick[0]} title={t.sysNav[0]}>
        <button className="btn btn-p btn-hero-l" onClick={() => setDlg("reg")}><Building2 size={18} strokeWidth={1.5} />{t.regCompany}<Bp /></button>
      </PageHead>
      <SysKpis />
      {!data ? <LoadState error={error} onRetry={reload} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 24, alignItems: "start" }}>
          <table className="tbl">
            <thead>
              <tr><th>Major</th><th>{t.company}</th><th className="r">{t.locations}</th><th className="r">{t.beacons}</th><th className="r">{t.users}</th><th>{t.status}</th></tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className={`click${sel?.id === c.id ? " sel" : ""}`} onClick={() => setSelId(c.id)}>
                  <td className="cond tnum" style={{ padding: "10px 8px 10px 0", fontSize: 20 }}>{c.major}</td>
                  <td style={{ padding: "10px 8px" }}><div className="b">{c.name}</div><div className="sub">{c.adminEmail ?? "—"}</div></td>
                  <td className="r tnum">{c.locations}</td>
                  <td className="r tnum">{c.beaconsActive} / {c.beaconsTotal}</td>
                  <td className="r tnum">{c.users}</td>
                  <td>{c.status === "active" ? <Tag kind="ok">{t.active}</Tag> : <Tag kind="ready">{t.onboarding}</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sel && (
            <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              <Bp />
              <div>
                <div className="kicker">Major {sel.major}</div>
                <div className="cond" style={{ fontSize: 26, lineHeight: 1.1 }}>{sel.name}</div>
                <div className="help">{sel.adminEmail ?? "—"} · {t.sinceL} {monYear(sel.createdAt, lang, TZ)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div className="lbl" style={{ paddingBottom: 6 }}>{t.allocated}</div>
                {sel.minors.length === 0 && <div className="help" style={{ padding: "8px 0", borderTop: "1px solid var(--divider)" }}>{t.noBeacons}</div>}
                {sel.minors.map((b) => (
                  <div key={b.serial} style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "7px 0", borderTop: "1px solid var(--divider)", fontSize: 13 }}>
                    <span className="mono" style={{ fontWeight: 600 }}>{b.minor ?? "—"}</span>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.placedAt ?? t.notPlaced}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{minorStatus(b, t)}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-s btn-md" onClick={() => setDlg("prog")}><Cpu size={16} strokeWidth={1.5} />{t.programFor} {sel.major}</button>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12, borderTop: "1px solid var(--divider)" }}>
                <div className="help">
                  {sel.ssoConfigured ? t.ssoOn : t.ssoOff}{sel.ssoDomains ? ` · ${sel.ssoDomains}` : ""} · {t.passShort} {sel.awayMinutes}/{sel.passLockMinutes} {t.min} · code <span className="mono">{sel.code}</span>
                </div>
                <button className="btn btn-s btn-md" onClick={() => setDlg("settings")}><Settings size={16} strokeWidth={1.5} />{t.settings}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {dlg === "reg" && (
        <RegisterDialog
          nextMajor={stats?.nextMajor ?? null}
          onClose={() => setDlg(null)}
          onDone={(r, name) => { toast(`${t.tReg} ${r.major} · ${name}`); reload().then(() => setSelId(r.id)); refreshStats(); }}
        />
      )}
      {dlg === "prog" && sel && (
        <ProgramDialog
          companies={list}
          uuid={stats?.uuid ?? ""}
          initialId={sel.id}
          onClose={() => setDlg(null)}
          onDone={(r) => { setDlg(null); toast(`${r.minors.length} ${t.tProg} ${r.major} — minor ${minorRange(r.minors)}`); reload(); refreshStats(); }}
        />
      )}
      {dlg === "settings" && sel && (
        <SettingsDialog company={sel} onClose={() => setDlg(null)} onDone={() => { setDlg(null); toast(`${t.tSettings} ${sel.name}`); reload(); }} />
      )}
    </>
  );
}

type RegResult = { id: string; major: number; code: string; minors: number[]; devToken?: string };

function RegisterDialog({ nextMajor, onClose, onDone }: { nextMajor: number | null; onClose: () => void; onDone: (r: RegResult, name: string) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [qty, setQty] = useState("2");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<RegResult | null>(null);
  const n = Math.max(0, Math.floor(Number(qty) || 0));

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api<RegResult>("/api/sys/companies", { body: { name: name.trim(), adminEmail: email.trim(), beacons: n } });
      setDone(r);
      onDone(r, name.trim());
    } catch (e2) { setErr(errText(e2, t)); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <Dialog title={t.regDone} onClose={onClose} wide>
        <div className="auth-body" style={{ fontSize: 15 }}>{fill(t.regDoneSub, { m: done.major, c: done.code })}</div>
        {done.minors.length > 0 && <div className="mono" style={{ fontSize: 13 }}>minor {minorRange(done.minors)}</div>}
        {done.devToken && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
            <a className="btn btn-dashed" href={`/auth/verify?token=${encodeURIComponent(done.devToken)}`} target="_blank" rel="noreferrer">{t.devLink}</a>
            <span className="help">{t.devLinkHelp}</span>
          </div>
        )}
        <div className="actions"><button className="btn btn-p btn-md" style={{ padding: "0 16px" }} onClick={onClose}>{t.done}</button></div>
      </Dialog>
    );
  }

  return (
    <Dialog title={t.regCompany} onClose={onClose} wide>
      <form onSubmit={register} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label className="field">{t.companyName}<input className="inp" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Hofman Installatietechniek" maxLength={120} /></label>
        <label className="field">{t.adminEmail}<input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@company.nl" /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid var(--divider)" }}>
          <div style={{ padding: "12px 14px" }}>
            <div className="lbl11">{t.majorAssigned}</div>
            <div className="cond" style={{ fontSize: 34, lineHeight: 1.05 }}>{nextMajor ?? "…"}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.nextFree}</div>
          </div>
          <label className="lbl11" style={{ padding: "12px 14px", borderLeft: "1px solid var(--divider)", display: "flex", flexDirection: "column", gap: 6 }}>
            {t.firstBeacons}
            <input className="inp" type="number" min={0} max={500} value={qty} onChange={(e) => setQty(e.target.value)} style={{ fontSize: 16, letterSpacing: 0, textTransform: "none", fontWeight: 400 }} />
            <span style={{ fontSize: 12, letterSpacing: 0, textTransform: "none", fontWeight: 400 }}>minor {n > 0 ? (n === 1 ? "1" : `1–${n}`) : "—"}</span>
          </label>
        </div>
        <div className="help" style={{ display: "flex", gap: 8 }}><Info size={16} strokeWidth={1.5} style={{ flex: "none", marginTop: 1 }} />{t.regHelp}</div>
        {err && <div className="err">{err}</div>}
        <div className="actions">
          <button type="button" className="btn btn-s btn-md" onClick={onClose}>{t.cancel}</button>
          <button type="submit" className="btn btn-p btn-md" style={{ padding: "0 16px" }} disabled={busy || name.trim().length < 2 || !email.includes("@")}>{t.register}</button>
        </div>
      </form>
    </Dialog>
  );
}

function SettingsDialog({ company, onClose, onDone }: { company: Company; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [away, setAway] = useState(String(company.awayMinutes));
  const [lock, setLock] = useState(String(company.passLockMinutes));
  const [domains, setDomains] = useState(company.ssoDomains ?? "");
  const [issuer, setIssuer] = useState(company.ssoIssuer ?? "");
  const [clientId, setClientId] = useState(company.ssoClientId ?? "");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setFieldErr({});
    try {
      await api(`/api/sys/companies/${company.id}`, {
        method: "PATCH",
        body: {
          awayMinutes: Math.max(1, Math.min(60, Math.floor(Number(away) || 3))),
          passLockMinutes: Math.max(1, Math.min(240, Math.floor(Number(lock) || 15))),
          ssoDomains: domains.trim() || null,
          ssoIssuer: issuer.trim() || null,
          ssoClientId: clientId.trim() || null,
          ...(secret.trim() ? { ssoClientSecret: secret.trim() } : {}),
        },
      });
      onDone();
    } catch (e2) {
      setErr(errText(e2, t));
      const f = (e2 as { fields?: Record<string, string> }).fields;
      if (f) setFieldErr(f);
      setBusy(false);
    }
  }
  const callback = typeof window !== "undefined" ? `${window.location.origin}/api/auth/sso/callback` : "";
  return (
    <Dialog title={t.settingsT} onClose={onClose} wide>
      <div className="help" style={{ marginTop: -8 }}>{company.name} · major {company.major}</div>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 16 }}>
          <label className="field" style={{ maxWidth: 240 }}>{t.awayL}<input className="inp" type="number" min={1} max={60} value={away} onChange={(e) => setAway(e.target.value)} /></label>
          <label className="field" style={{ maxWidth: 240 }}>{t.lockL}<input className="inp" type="number" min={1} max={240} value={lock} onChange={(e) => setLock(e.target.value)} /></label>
        </div>
        <div className="help" style={{ marginTop: -10 }}>{t.passHelp}</div>
        <div className="lbl" style={{ paddingTop: 6, borderTop: "1px solid var(--divider)" }}>{t.ssoT}</div>
        <label className="field">{t.ssoDomains}<input className="inp" value={domains} placeholder={t.ssoDomainsPh} onChange={(e) => setDomains(e.target.value)} /></label>
        <label className="field">{t.ssoIssuer}<input className="inp" value={issuer} placeholder={t.ssoIssuerPh} onChange={(e) => setIssuer(e.target.value)} aria-invalid={!!fieldErr.ssoIssuer} style={fieldErr.ssoIssuer ? { borderColor: "var(--accent-900)" } : undefined} /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label className="field">{t.ssoClientId}<input className="inp mono" value={clientId} onChange={(e) => setClientId(e.target.value)} /></label>
          <label className="field">{t.ssoSecret}<input className="inp mono" type="password" autoComplete="new-password" value={secret} placeholder={company.ssoConfigured ? "••••••••" : ""} onChange={(e) => setSecret(e.target.value)} /></label>
        </div>
        {company.ssoConfigured && <div className="help" style={{ marginTop: -10 }}>{t.ssoSecretKeep}</div>}
        <div className="field">{t.ssoCallback}<code className="mono note" style={{ fontSize: 12, wordBreak: "break-all" }}>{callback}</code></div>
        {err && <div className="err">{err}</div>}
        <div className="actions">
          <button type="button" className="btn btn-s btn-md" onClick={onClose}>{t.cancel}</button>
          <button type="submit" className="btn btn-p btn-md" style={{ padding: "0 16px" }} disabled={busy}>{t.save}</button>
        </div>
      </form>
    </Dialog>
  );
}
