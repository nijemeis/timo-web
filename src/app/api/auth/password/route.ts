import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, clientIp, rateLimit, route } from "@/lib/api";
import { checkPassword, createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/** Password sign-in, for Timo system admins only (bootstrap before email is set up). */
export const POST = route(async (req) => {
  const { email, password } = z.object({ email: z.string().trim().toLowerCase(), password: z.string().min(1) }).parse(await req.json());
  rateLimit(`pw:${clientIp(req)}`, 8);
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.passwordHash || user.role !== "system_admin" || !(await checkPassword(password, user.passwordHash))) {
    throw bad("credentials", "Email or password is not correct.");
  }
  const token = await createSession(user.id, req.headers.get("user-agent"));
  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
