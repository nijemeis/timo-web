"use client";
import { useState } from "react";
import { Building2, KeyRound, Loader2, Mail, MailCheck, TriangleAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api, ApiErr, errText } from "@/lib/fetcher";
import { Bp } from "@/components/ui/Bp";
import { AuthFrame } from "./AuthFrame";

type LinkRes = { ok: true; devToken?: string };

export async function requestLink(email: string) {
  return api<LinkRes>("/api/auth/magic-link", { body: { email, client: "web" } });
}

/** "Check your inbox" — shared by /login and the expired-link states of /auth/verify. */
export function SentView({ email, devToken, onResend, onOther }: { email: string; devToken?: string; onResend: () => Promise<void>; onOther: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  return (
    <>
      <div className="iconbox"><MailCheck size={30} strokeWidth={1.5} /><Bp /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h1 className="auth-title" style={{ fontSize: 38 }}>{t.magicTitle}</h1>
        <p className="auth-body" style={{ margin: 0 }}>
          {t.magicSub} <b>{email}</b>. {t.magicExp}
        </p>
        <p className="help" style={{ margin: 0 }}>{t.magicNoAccount}</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <button
          className="btn btn-ghost btn-md"
          style={{ fontSize: 16 }}
          disabled={busy}
          onClick={async () => { setBusy(true); try { await onResend(); setResent(true); } finally { setBusy(false); } }}
        >
          {busy && <Loader2 size={16} className="spin" />}
          {resent ? t.resent : t.resend}
        </button>
        {devToken && (
          <a className="btn btn-dashed" href={`/auth/verify?token=${encodeURIComponent(devToken)}`}>{t.demoOpen}</a>
        )}
        <button className="linkbtn" onClick={onOther}>{t.useOther}</button>
      </div>
    </>
  );
}

export function LoginForm({ initialError }: { initialError?: string | null }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"link" | "password" | "sent">("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "link" | "sso" | "pw">(null);
  const [error, setError] = useState<string | null>(initialError ? (t.errCodes[initialError] ? initialError : "sso_failed") : null);
  const [devToken, setDevToken] = useState<string | undefined>();

  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  async function sendLink(e?: React.FormEvent) {
    e?.preventDefault();
    if (!valid) { setError("invalid"); return; }
    setBusy("link"); setError(null);
    try {
      const r = await requestLink(email.trim());
      setDevToken(r.devToken);
      setMode("sent");
    } catch (err) {
      setError(errText(err, t));
    } finally { setBusy(null); }
  }

  async function sso() {
    if (!valid) { setError("enterEmail"); return; }
    setBusy("sso"); setError(null);
    try {
      const r = await api<{ url: string }>(`/api/auth/sso/start?email=${encodeURIComponent(email.trim())}&client=web&json=1`);
      window.location.href = r.url;
    } catch (err) {
      setError(err instanceof ApiErr && t.errCodes[err.code] ? err.code : err instanceof ApiErr && err.code === "network" ? t.errNetwork : "sso_failed");
      setBusy(null);
    }
  }

  async function passwordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy("pw"); setError(null);
    try {
      await api("/api/auth/password", { body: { email: email.trim(), password } });
      window.location.href = "/";
    } catch (err) {
      setError(errText(err, t));
      setBusy(null);
    }
  }

  if (mode === "sent") {
    return (
      <AuthFrame>
        <SentView
          email={email.trim()}
          devToken={devToken}
          onResend={async () => { const r = await requestLink(email.trim()); setDevToken(r.devToken); }}
          onOther={() => { setMode("link"); setDevToken(undefined); }}
        />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <h1 className="auth-title">{t.tagline}</h1>
      {error && <div className="err" role="alert"><TriangleAlert size={16} strokeWidth={1.5} />{error === "enterEmail" ? t.enterEmail : t.errCodes[error] ?? error}</div>}
      <form onSubmit={mode === "password" ? passwordSignIn : sendLink} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
        <label className="field" style={{ fontSize: 14 }}>
          {t.emailLabel}
          <input className="inp h48" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPh} />
        </label>
        {mode === "password" && (
          <label className="field" style={{ fontSize: 14 }}>
            {t.passwordLabel}
            <input className="inp h48" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        <button type="submit" className="btn btn-p btn-auth" disabled={!!busy}>
          {busy === "link" || busy === "pw" ? <Loader2 size={20} className="spin" /> : mode === "password" ? <KeyRound size={20} strokeWidth={1.5} /> : <Mail size={20} strokeWidth={1.5} />}
          {mode === "password" ? t.signInPw : t.sendLink}
          <Bp />
        </button>
      </form>
      {mode === "link" && (
        <>
          <div className="or">{t.or}</div>
          <button type="button" className="btn btn-s btn-auth" onClick={sso} disabled={!!busy}>
            {busy === "sso" ? <Loader2 size={20} className="spin" /> : <Building2 size={20} strokeWidth={1.5} />}
            {t.sso}
          </button>
        </>
      )}
      <div style={{ textAlign: "center" }}>
        <button type="button" className="linkbtn" style={{ fontSize: 13, color: "var(--muted)" }} onClick={() => { setMode(mode === "password" ? "link" : "password"); setError(null); }}>
          {mode === "password" ? t.sysBack : t.sysToggle}
        </button>
      </div>
    </AuthFrame>
  );
}
