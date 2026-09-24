import { Bp } from "./Bp";

/** The TIMO wordmark in a hairline box with corner marks, preceded by the beacon glyph. */
export function Brand({ size = 22, href }: { size?: number; href?: string }) {
  const inner = (
    <>
      <span className="glyph" aria-hidden><i /></span>TIMO<Bp />
    </>
  );
  return href ? (
    <a className="brand" href={href} style={{ fontSize: size }} aria-label="Timo">{inner}</a>
  ) : (
    <div className="brand" style={{ fontSize: size }} aria-label="Timo">{inner}</div>
  );
}
