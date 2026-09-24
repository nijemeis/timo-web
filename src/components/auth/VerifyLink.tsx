"use client";
import { useEffect, useRef, useState } from "react";
import { Hourglass, Link2Off, Loader2, Mail, TriangleAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { api, ApiErr, errText } from "@/lib/fetcher";
import { Bp } from "@/components/ui/Bp";
import { AuthFrame } from "./AuthFrame";
import { requestLink, SentView } from "./LoginForm";

type State = "checking" | "link_expired" | "link_used" | "link_invalid" | "error" | "sent";

/** POSTs the magic-link token once, then routes to `/`. Expired / used / invalid links get their own state. */
export function VerifyLink({ token }: { token: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<State>(token ? "checking" : "link_invalid");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | undefined>();
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return; // a link is single-use: never POST it twice (StrictMode remounts)
    started.current = true;
    api("/api/auth/verify", { body: { token } })
      .then(() => window.location.replace("/"))
      .catch((e) => {
        if (e instanceof ApiErr && ["link_expired", "link_used", "link_invalid"].includes(e.code)) setState(e.code as State);
        else if (e instanceof ApiErr && e.code === "invalid") setState("link_invalid");
        else { setErr(errText(e, t)); setState("error"); }
      });
  }, [token, t]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr(t.errCodes.invalid); return; }
    setBusy(true); setErr(null);
    try {
      const r = await requestLink(email.trim());
      setDevToken(r.devToken);
      setState("sent");
    } catch (e2) { setErr(errText(e2, t)); } finally { setBusy(false); }
  }

  if (state === "checking") {
    return (
      <AuthFrame>
        <div className="iconbox"><Loader2 size={28} strokeWidth={1.5} className="spin" /><Bp /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 className="auth-title">{t.verifying}</h1>
          <p className="auth-body" style={{ margin: 0 }}>{t.verifyingSub}</p>
        </div>
      </AuthFrame>
    );
  }

  if (state === "sent") {
    return (
      <AuthFrame>
        <SentView email={email.trim()} devToken={devToken} onResend={async () => { const r = await requestLink(email.trim()); setDevToken(r.devToken); }} onOther={() => setState("link_expired")} />
      </AuthFrame>
    );
  }

  const copy = {
    link_expired: { icon: Hourglass, title: t.linkExpiredT, body: t.linkExpiredB },
    link_used: { icon: Link2Off, title: t.linkUsedT, body: t.linkUsedB },
    link_invalid: { icon: TriangleAlert, title: t.linkInvalidT, body: t.linkInvalidB },
    error: { icon: TriangleAlert, title: t.linkInvalidT, body: err ?? t.errGeneric },
  }[state];
  const Icon = copy.icon;

  return (
    <AuthFrame>
      <div className="iconbox"><Icon size={30} strokeWidth={1.5} /><Bp /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h1 className="auth-title" style={{ fontSize: 38 }}>{copy.title}</h1>
        <p className="auth-body" style={{ margin: 0 }}>{copy.body}</p>
      </div>
      <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
        <label className="field" style={{ fontSize: 14 }}>
          {t.emailLabel}
          <input className="inp h48" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPh} />
        </label>
        {err && state !== "error" && <div className="err" role="alert"><TriangleAlert size={16} strokeWidth={1.5} />{err}</div>}
        <button type="submit" className="btn btn-p btn-auth" disabled={busy}>
          {busy ? <Loader2 size={20} className="spin" /> : <Mail size={20} strokeWidth={1.5} />}
          {t.requestNew}
          <Bp />
        </button>
      </form>
      <div style={{ textAlign: "center" }}><a href="/login" style={{ fontSize: 14 }}>{t.backToSignIn}</a></div>
    </AuthFrame>
  );
}
