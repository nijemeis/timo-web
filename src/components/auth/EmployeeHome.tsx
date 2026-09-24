"use client";
import { LogOut, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Bp } from "@/components/ui/Bp";
import { signOut } from "@/components/ui/signOut";
import { AuthFrame } from "./AuthFrame";

export function EmployeeHome({ name, email }: { name: string; email: string }) {
  const { t } = useI18n();
  return (
    <AuthFrame>
      <div className="iconbox"><Smartphone size={30} strokeWidth={1.5} /><Bp /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h1 className="auth-title">{t.empTitle}</h1>
        <p className="auth-body" style={{ margin: 0 }}>{t.empBody}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[t.appStore, t.playStore].map((label) => (
          <div key={label} className="card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 2 }} aria-disabled>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
            <span className="lbl11">{t.soon}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 14, borderTop: "1px solid var(--divider)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.empSignedIn}</div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: 13, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
        </div>
        <button className="btn btn-s btn-md" onClick={signOut}><LogOut size={16} strokeWidth={1.5} />{t.signOut}</button>
      </div>
    </AuthFrame>
  );
}
