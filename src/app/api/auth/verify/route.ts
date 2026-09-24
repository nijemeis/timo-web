import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { consumeMagicLink } from "@/lib/magic";
import { meUser } from "@/lib/me";

/** POST {token} → {token, user}. Also sets the web session cookie, so the admin can use it directly. */
export const POST = route(async (req) => {
  const { token } = z.object({ token: z.string().min(10) }).parse(await req.json());
  const { user } = await consumeMagicLink(token);
  const session = await createSession(user.id, req.headers.get("user-agent"));
  const res = NextResponse.json({ token: session, user: meUser(user) });
  res.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
  return res;
});
