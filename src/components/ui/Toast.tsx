"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";

type Toast = { msg: string; error?: boolean; id: number };
const ToastCtx = createContext<(msg: string, opts?: { error?: boolean }) => void>(() => {});

/** Dark #1d1f20 toast with a check icon, 2.6 s (errors stay a little longer). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((msg: string, opts?: { error?: boolean }) => {
    clearTimeout(timer.current);
    setToast({ msg, error: opts?.error, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), opts?.error ? 4200 : 2600);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div key={toast.id} className="toast" role="status" aria-live="polite">
          {toast.error ? <TriangleAlert size={17} strokeWidth={1.5} /> : <Check size={17} strokeWidth={1.5} />}
          {toast.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
