/** Page header: 12px uppercase kicker over the 38px condensed title, actions on the right. */
export function PageHead({ kicker, title, children }: { kicker: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <div className="kicker">{kicker}</div>
        <h1 className="h1">{title}</h1>
      </div>
      {children && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{children}</div>}
    </header>
  );
}
