import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { appUrl } from "./auth";
import { bad } from "./api";

/**
 * Company SSO via OpenID Connect (authorization code + PKCE). Each company stores its issuer, client id and
 * secret; the IdP must allow `${APP_URL}/api/auth/sso/callback` as redirect URI. The id_token comes straight
 * from the token endpoint over TLS, so (per OIDC Core 3.1.3.7) its claims are checked, not its signature.
 * SAML is not implemented — most IdPs (Entra ID, Google Workspace, Okta) also speak OIDC.
 */
type Discovery = { authorization_endpoint: string; token_endpoint: string; issuer: string };
const discoCache = new Map<string, { at: number; d: Discovery }>();

async function discover(issuer: string): Promise<Discovery> {
  const hit = discoCache.get(issuer);
  if (hit && Date.now() - hit.at < 3600_000) return hit.d;
  const res = await fetch(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`);
  if (!res.ok) throw bad("sso_discovery", "Your company's sign-in service could not be reached.");
  const d = (await res.json()) as Discovery;
  discoCache.set(issuer, { at: Date.now(), d });
  return d;
}

export const callbackUrl = () => `${appUrl()}/api/auth/sso/callback`;
const b64url = (b: Buffer) => b.toString("base64url");

/** Find the company for an email domain or a company code. */
export async function findSsoCompany(q: { email?: string; code?: string }) {
  if (q.code) {
    const c = await db.company.findUnique({ where: { code: q.code.trim().toUpperCase() } });
    if (c?.ssoIssuer && c.ssoClientId) return c;
  }
  const domain = q.email?.split("@")[1]?.toLowerCase();
  if (domain) {
    const list = await db.company.findMany({ where: { ssoDomains: { contains: domain } } });
    const c = list.find((c) => (c.ssoDomains ?? "").split(",").map((d) => d.trim().toLowerCase()).includes(domain));
    if (c?.ssoIssuer && c.ssoClientId) return c;
  }
  return null;
}

export async function startSso(companyId: string, client: "web" | "app"): Promise<string> {
  const c = await db.company.findUnique({ where: { id: companyId } });
  if (!c?.ssoIssuer || !c.ssoClientId) throw bad("sso_not_configured", "SSO is not set up for this company.");
  const d = await discover(c.ssoIssuer);
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(32));
  const nonce = b64url(randomBytes(16));
  await db.ssoState.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 3600_000) } } });
  await db.ssoState.create({ data: { state, companyId: c.id, verifier, nonce, client } });
  const url = new URL(d.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code", client_id: c.ssoClientId, redirect_uri: callbackUrl(), scope: "openid email profile",
    state, nonce, code_challenge: b64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function finishSso(state: string, code: string) {
  const s = await db.ssoState.findUnique({ where: { state } });
  if (!s || s.createdAt < new Date(Date.now() - 15 * 60_000)) throw bad("sso_state", "The sign-in took too long. Try again.");
  await db.ssoState.delete({ where: { state } });
  const c = await db.company.findUnique({ where: { id: s.companyId } });
  if (!c?.ssoIssuer || !c.ssoClientId) throw bad("sso_not_configured", "SSO is not set up for this company.");
  const d = await discover(c.ssoIssuer);
  const res = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: callbackUrl(), client_id: c.ssoClientId, code_verifier: s.verifier,
      ...(c.ssoClientSecret ? { client_secret: c.ssoClientSecret } : {}),
    }),
  });
  if (!res.ok) throw bad("sso_token", "Your company's sign-in service refused the login.");
  const tok = (await res.json()) as { id_token?: string };
  if (!tok.id_token) throw bad("sso_token", "No identity returned by the sign-in service.");
  const claims = JSON.parse(Buffer.from(tok.id_token.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== d.issuer || !aud.includes(c.ssoClientId) || claims.nonce !== s.nonce || (typeof claims.exp === "number" && claims.exp * 1000 < Date.now())) {
    throw bad("sso_claims", "The sign-in response could not be verified.");
  }
  const email = String(claims.email ?? claims.preferred_username ?? "").toLowerCase();
  if (!email.includes("@")) throw bad("sso_email", "Your company account has no email address.");
  const name = String(claims.name ?? email.split("@")[0]);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.companyId && existing.companyId !== c.id) throw bad("sso_other_company", "This account belongs to another company.");
  const user = existing
    ? await db.user.update({ where: { id: existing.id }, data: { companyId: c.id, status: "active", lastActiveAt: new Date() } })
    : await db.user.create({ data: { email, name, companyId: c.id, status: "active", role: "employee" } });
  return { user, client: s.client as "web" | "app" };
}
