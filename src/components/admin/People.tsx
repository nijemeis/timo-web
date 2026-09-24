"use client";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { num } from "@/lib/i18n";
import { api, errText } from "@/lib/fetcher";
import { Bp } from "@/components/ui/Bp";
import { Dialog } from "@/components/ui/Dialog";
import { PageHead } from "@/components/ui/PageHead";
import { Tag } from "@/components/ui/Tag";
import { LoadState } from "@/components/ui/LoadState";
import { useApi } from "@/components/ui/hooks";
import { useToast } from "@/components/ui/Toast";
import { useAdmin } from "./AdminShell";

type Role = "employee" | "manager" | "company_admin";
type Person = { id: string; name: string; email: string; team: string | null; role: Role; contractHours: number; device: string | null; status: "invited" | "in" | "active" };
type Data = { code: string; teams: string[]; people: Person[] };

export function People() {
  const { t, lang } = useI18n();
  const { isAdmin } = useAdmin();
  const toast = useToast();
  const { data, error, reload } = useApi<Data>("/api/admin/people", { poll: 60_000 });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [edit, setEdit] = useState<Person | null>(null);

  const roleName = (r: Role) => (r === "company_admin" ? t.adminR : r === "manager" ? t.managerR : t.employeeR);
  const hoursTxt = (h: number) => `${num(h, lang, h % 1 ? 1 : 0)}${lang === "nl" ? "u" : "h"}`;
  // "iOS · iPhone 15" → "iPhone 15" (the design shows the model only).
  const device = (d: string | null) => (d ? d.split(" · ").slice(-1)[0] : "—");

  return (
    <>
      <PageHead kicker={t.kick[5]} title={t.nav[5]} />
      {!data ? <LoadState error={error} onRetry={reload} /> : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--muted)" }}>
              {t.selfCode}
              <span className="mono" style={{ position: "relative", padding: "4px 10px", border: "1px solid var(--divider)", fontSize: 14, color: "var(--text)", letterSpacing: ".06em" }}>{data.code}</span>
            </div>
            {isAdmin && (
              <button className="btn btn-p btn-hero" onClick={() => setInviteOpen(true)}><UserPlus size={17} strokeWidth={1.5} />{t.invite}<Bp /></button>
            )}
          </div>
          <table className="tbl">
            <thead>
              <tr><th>{t.employee}</th><th>{t.team}</th><th>{t.role}</th><th>{t.contract}</th><th>{t.device}</th><th>{t.status}</th></tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.id} className="click" onClick={() => setEdit(p)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setEdit(p); }}>
                  <td><div className="b">{p.name}</div><div className="sub">{p.email}</div></td>
                  <td>{p.team ?? "—"}</td>
                  <td>{roleName(p.role)}</td>
                  <td className="tnum">{hoursTxt(p.contractHours)}</td>
                  <td className="muted">{device(p.device)}</td>
                  <td>{p.status === "invited" ? <Tag kind="ready">{t.invited}</Tag> : <Tag kind="ok">{p.status === "in" ? t.inNowK : t.active}</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {inviteOpen && (
            <InviteDialog
              teams={data.teams}
              onClose={() => setInviteOpen(false)}
              onDone={(n, skipped) => { setInviteOpen(false); toast(`${n} ${t.tInvited}${skipped.length ? ` · ${skipped.length} ${t.tSkipped}` : ""}`); reload(); }}
            />
          )}
          {edit && <PersonDialog person={edit} teams={data.teams} canRole={isAdmin} onClose={() => setEdit(null)} onDone={() => { setEdit(null); toast(`${t.tPersonSaved} — ${edit.name}`); reload(); }} />}
        </>
      )}
    </>
  );
}

function InviteDialog({ teams, onClose, onDone }: { teams: string[]; onClose: () => void; onDone: (n: number, skipped: string[]) => void }) {
  const { t } = useI18n();
  const [emails, setEmails] = useState("");
  const [team, setTeam] = useState(teams[0] ?? "");
  const [hours, setHours] = useState("40");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api<{ invited: number; skipped: string[] }>("/api/admin/invites", { body: { emails, team: team.trim() || null, contractHours: Number(hours) || 0 } });
      onDone(r.invited, r.skipped);
    } catch (e2) { setErr(errText(e2, t)); setBusy(false); }
  }
  return (
    <Dialog title={t.invite} onClose={onClose}>
      <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label className="field">{t.emails}<textarea className="inp" autoFocus value={emails} placeholder={t.emailsPh} onChange={(e) => setEmails(e.target.value)} /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label className="field">{t.team}
            <input className="inp" list="teams-list" value={team} onChange={(e) => setTeam(e.target.value)} />
            <datalist id="teams-list">{teams.map((x) => <option key={x} value={x} />)}</datalist>
          </label>
          <label className="field">{t.contract}<input className="inp" type="number" min={0} max={60} value={hours} onChange={(e) => setHours(e.target.value)} /></label>
        </div>
        <div className="help">{t.inviteHelp}</div>
        {err && <div className="err">{err}</div>}
        <div className="actions">
          <button type="button" className="btn btn-s btn-md" onClick={onClose}>{t.cancel}</button>
          <button type="submit" className="btn btn-p btn-md" style={{ padding: "0 16px" }} disabled={busy || !emails.includes("@")}>{t.sendInv}</button>
        </div>
      </form>
    </Dialog>
  );
}

function PersonDialog({ person, teams, canRole, onClose, onDone }: { person: Person; teams: string[]; canRole: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(person.name);
  const [team, setTeam] = useState(person.team ?? "");
  const [role, setRole] = useState<Role>(person.role);
  const [hours, setHours] = useState(String(person.contractHours));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api(`/api/admin/people/${person.id}`, {
        method: "PATCH",
        body: { name: name.trim(), team: team.trim() || null, contractHours: Number(hours) || 0, ...(canRole && role !== person.role ? { role } : {}) },
      });
      onDone();
    } catch (e2) { setErr(errText(e2, t)); setBusy(false); }
  }
  return (
    <Dialog title={t.editPerson} onClose={onClose}>
      <div className="help" style={{ marginTop: -8 }}>{person.email}</div>
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label className="field">{t.name}<input className="inp" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></label>
        <div style={{ display: "grid", gridTemplateColumns: canRole ? "1fr 1fr 110px" : "1fr 110px", gap: 12 }}>
          <label className="field">{t.team}
            <input className="inp" list="teams-list-edit" value={team} placeholder={t.noTeam} onChange={(e) => setTeam(e.target.value)} />
            <datalist id="teams-list-edit">{teams.map((x) => <option key={x} value={x} />)}</datalist>
          </label>
          {canRole && (
            <label className="field">{t.role}
              <select className="inp" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="employee">{t.employeeR}</option>
                <option value="manager">{t.managerR}</option>
                <option value="company_admin">{t.adminR}</option>
              </select>
            </label>
          )}
          <label className="field">{t.hoursWeek}<input className="inp" type="number" min={0} max={60} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} /></label>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="actions">
          <button type="button" className="btn btn-s btn-md" onClick={onClose}>{t.cancel}</button>
          <button type="submit" className="btn btn-p btn-md" style={{ padding: "0 16px" }} disabled={busy || name.trim().length < 2}>{t.save}</button>
        </div>
      </form>
    </Dialog>
  );
}
