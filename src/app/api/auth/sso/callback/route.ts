import { NextResponse } from "next/server";
import { appUrl, createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { finishSso } from "@/lib/sso";
import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";

/** The IdP sends the browser here. Web → cookie + admin; app → back into timo://auth with a session token. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  // Know where to send errors before finishing: the app's in-app browser only returns on a timo:// URL.
  const pending = await db.ssoState.findUnique({ where: { state: q.get("state") ?? "" } });
  const toApp = pending?.client === "app";
  try {
    if (q.get("error")) throw new ApiError(400, "sso_denied", q.get("error_description") || "Sign-in was cancelled.");
    const { user, client } = await finishSso(q.get("state") ?? "", q.get("code") ?? "");
    const token = await createSession(user.id, req.headers.get("user-agent"));
    if (client === "app") return NextResponse.redirect(`timo://auth?session=${encodeURIComponent(token)}`);
    const res = NextResponse.redirect(`${appUrl()}/`);
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (e) {
    const code = e instanceof ApiError ? e.code : "sso_failed";
    if (toApp) return NextResponse.redirect(`timo://auth?error=${encodeURIComponent(code)}`);
    return NextResponse.redirect(`${appUrl()}/login?error=${encodeURIComponent(code)}`);
  }
}
