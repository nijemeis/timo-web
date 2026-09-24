import type { LucideIcon } from "lucide-react";

export type TagKind = "ok" | "ready" | "alert" | "stock";

/** Status tag: ok = neutral, ready/info = accent tint, alert = accent-900 fill, stock = outline. */
export function Tag({ kind, icon: Icon, children }: { kind: TagKind; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <span className={`tag tag-${kind}`}>
      {Icon && <Icon size={13} strokeWidth={1.5} />}
      {children}
    </span>
  );
}
