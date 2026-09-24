import "server-only";
import { db } from "./db";
import { appUrl, devLinkAllowed, MAGIC_LINK_MINUTES, newToken, sha } from "./auth";
import { esc, layout, sendMail } from "./email";
import { bad } from "./api";

export type Client = "web" | "app";

/** Link the email points at. Web lands on /auth/verify; the app link bounces through /m/<token> into timo://. */
export function linkFor(token: string, client: Client) {
  return client === "app" ? `${appUrl()}/m/${token}` : `${appUrl()}/auth/verify?token=${token}`;
}

/**
 * Create a single-use, 15-minute sign-in link and email it. Unknown addresses get no email but the same
 * response, so the endpoint can't be used to probe who has an account.
 */
export async function issueMagicLink(email: string, client: Client, opts: { invite?: { companyName: string; code: string; inviter: string } } = {}) {
  email = email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email }, include: { company: true } });
  if (!user) return { ok: true as const };
  const token = newToken();
  await db.magicLink.create({ data: { tokenHash: sha(token), email, client, expiresAt: new Date(Date.now() + MAGIC_LINK_MINUTES * 60_000) } });
  const href = linkFor(token, client);
  const nl = user.locale === "nl";
  const inv = opts.invite;
  const subject = inv
    ? nl ? `${inv.inviter} nodigt je uit voor Timo bij ${inv.companyName}` : `${inv.inviter} invited you to Timo at ${inv.companyName}`
    : nl ? "Je Timo-inloglink" : "Your Timo sign-in link";
  const paras = inv
    ? nl
      ? [`Hallo ${esc(user.name)},`, `${esc(inv.companyName)} gebruikt Timo: je tijdregistratie start vanzelf zodra je binnenloopt.`, `Installeer de Timo-app en log in met deze link. Je bedrijfscode is <b style="font-family:Menlo,monospace">${esc(inv.code)}</b>.`]
      : [`Hi ${esc(user.name)},`, `${esc(inv.companyName)} uses Timo: your time registration starts by itself when you walk in.`, `Install the Timo app and sign in with this link. Your company code is <b style="font-family:Menlo,monospace">${esc(inv.code)}</b>.`]
    : nl
      ? [`Tik op de knop om in te loggen bij Timo. De link verloopt over ${MAGIC_LINK_MINUTES} minuten en werkt één keer.`]
      : [`Tap the button to sign in to Timo. The link expires in ${MAGIC_LINK_MINUTES} minutes and works once.`];
  const label = nl ? "Inloggen bij Timo" : "Sign in to Timo";
  const text = `${paras.map((p) => p.replace(/<[^>]+>/g, "")).join("\n\n")}\n\n${label}: ${href}`;
  const sent = await sendMail({ to: email, subject, html: layout(subject, paras, { href, label }), text });
  if (!sent.ok) console.error("magic link email failed", sent.error);
  return { ok: true as const, ...(devLinkAllowed(email) ? { devToken: token } : {}) };
}

/** Consume a link: marks it used, activates the user, returns them. */
export async function consumeMagicLink(token: string) {
  const link = await db.magicLink.findUnique({ where: { tokenHash: sha(token) } });
  if (!link) throw bad("link_invalid", "This sign-in link is not valid.");
  if (link.usedAt) throw bad("link_used", "This sign-in link was already used. Request a new one.");
  if (link.expiresAt < new Date()) throw bad("link_expired", "This sign-in link has expired. Request a new one.");
  const claimed = await db.magicLink.updateMany({ where: { id: link.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!claimed.count) throw bad("link_used", "This sign-in link was already used. Request a new one.");
  const user = await db.user.update({ where: { email: link.email }, data: { status: "active", lastActiveAt: new Date() } });
  return { user, client: link.client as Client };
}
