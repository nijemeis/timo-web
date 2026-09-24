import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { currentToken, destroySession, SESSION_COOKIE } from "@/lib/auth";

export const POST = route(async () => {
  const token = await currentToken();
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
