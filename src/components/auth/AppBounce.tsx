"use client";
import { useEffect } from "react";
import { Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Bp } from "@/components/ui/Bp";
import { AuthFrame } from "./AuthFrame";

/** Mobile magic-link landing: hands the token to the app via timo://auth?token=… straight away. */
export function AppBounce({ token }: { token: string }) {
  const { t } = useI18n();
  const deep = `timo://auth?token=${encodeURIComponent(token)}`;
  useEffect(() => { window.location.href = deep; }, [deep]);
  return (
    <AuthFrame>
      <div className="iconbox"><Smartphone size={30} strokeWidth={1.5} /><Bp /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h1 className="auth-title" style={{ fontSize: 38 }}>{t.mTitle}</h1>
        <p className="auth-body" style={{ margin: 0 }}>{t.mBody}</p>
      </div>
      <a className="btn btn-p btn-auth" href={deep}><Smartphone size={20} strokeWidth={1.5} />{t.mOpen}<Bp /></a>
      <p className="help" style={{ margin: 0 }}>{t.mHelp}</p>
      <p className="help" style={{ margin: 0 }}>{t.mNotHere} <a href="/login">{t.backToSignIn}</a></p>
    </AuthFrame>
  );
}
