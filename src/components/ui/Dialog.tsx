"use client";
import { useEffect } from "react";
import { Bp } from "./Bp";

/** Modal dialog in the handoff style: scrim, square panel with corner marks, pop-in. Esc closes. */
export function Dialog({ title, onClose, wide, children, labelledBy = "dlg-title" }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode; labelledBy?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dlg-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={`dialog${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
          <Bp />
          <div className="dlg-title" id={labelledBy}>{title}</div>
          {children}
        </div>
      </div>
    </>
  );
}
