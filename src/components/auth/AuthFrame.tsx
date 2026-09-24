"use client";
import { Brand } from "@/components/ui/Brand";
import { LangToggle } from "@/components/ui/LangToggle";

/** Centered single-column frame shared by sign-in, verify, bounce and employee pages. */
export function AuthFrame({ children, brand = true }: { children: React.ReactNode; brand?: boolean }) {
  return (
    <main className="auth">
      <div className="auth-col">
        {brand && <div style={{ marginBottom: 10 }}><Brand size={30} href="/login" /></div>}
        {children}
        <LangToggle style={{ width: 120, marginTop: 18 }} />
      </div>
    </main>
  );
}
