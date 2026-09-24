import "server-only";

/**
 * Transactional email through Resend when RESEND_API_KEY is set; otherwise the message is printed to the
 * server console so development (and a production without email yet) still shows what would be sent.
 */
export type Mail = { to: string; subject: string; html: string; text: string };

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendMail(mail: Mail): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n📧 [email → ${mail.to}] ${mail.subject}\n${mail.text}\n`);
    return { ok: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || "Timo <no-reply@timo.app>", to: mail.to, subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Monochrome, square-cornered layout in the Industry palette. */
export function layout(title: string, paragraphs: string[], cta?: { href: string; label: string }, footer?: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f2f2f3;font-family:Barlow,Helvetica,Arial,sans-serif;color:#1d1f20">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
  <div style="display:inline-block;border:1px solid rgba(29,31,32,.16);padding:6px 12px;font:600 18px 'Barlow Condensed',Arial Narrow,Arial,sans-serif;letter-spacing:.14em">TIMO</div>
  <div style="border:1px solid rgba(29,31,32,.16);padding:24px;margin-top:18px">
    <h1 style="font:600 28px/1.1 'Barlow Condensed',Arial Narrow,Arial,sans-serif;margin:0 0 14px">${esc(title)}</h1>
    ${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${p}</p>`).join("")}
    ${cta ? `<p style="margin:20px 0 4px"><a href="${cta.href}" style="display:inline-block;background:#5980a6;color:#f2f2f3;padding:14px 22px;font-weight:600;text-decoration:none">${esc(cta.label)}</a></p>` : ""}
  </div>
  <p style="font-size:12px;color:#7a7a7d;margin-top:16px">${footer ?? "Timo · time registration that starts when you walk in"}</p>
</div></body></html>`;
}
export { esc };
