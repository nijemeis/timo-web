"use client";
import { Loader2, TriangleAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { errText } from "@/lib/fetcher";

/** Placeholder while a view's first load runs, or its error with a retry. */
export function LoadState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  if (!error) return <div className="skeleton" style={{ display: "flex", gap: 8, alignItems: "center" }}><Loader2 size={16} className="spin" />{t.loading}</div>;
  return (
    <div className="err" style={{ padding: "16px 0", alignItems: "center" }}>
      <TriangleAlert size={16} strokeWidth={1.5} />{errText(error, t)}
      {onRetry && <button className="btn btn-s btn-xs" onClick={onRetry}>{t.retry}</button>}
    </div>
  );
}
