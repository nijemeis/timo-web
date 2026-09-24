import "server-only";
import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { db } from "./db";

/**
 * Opaque session tokens, stored hashed. The web admins carry the token in an httpOnly cookie; the mobile
 * apps send the same kind of token as `Authorization: Bearer`.
 */
export const SESSION_COOKIE = "timo_session";
const SESSION_DAYS = 90;
export const MAGIC_LINK_MINUTES = 15;

export const sha = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function createSession(userId: string, userAgent?: string | null): Promise<string> {
  const token = newToken();
  await db.session.create({
    data: { tokenHash: sha(token), userId, userAgent: userAgent?.slice(0, 200), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) },
  });
  return token;
}

export async function destroySession(token: string) {
  await db.session.deleteMany({ where: { tokenHash: sha(token) } });
}

export async function currentToken(): Promise<string | null> {
  const auth = (await headers()).get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function getUser(): Promise<User | null> {
  const token = await currentToken();
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export function sessionCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86400 };
}

export const appUrl = () => (process.env.APP_URL || "http://localhost:3200").replace(/\/$/, "");

/**
 * Whether a sign-in link may be handed straight back to the client (the prototype's "demo: open the link").
 * Always in development; in production only for DEMO_LOGIN_DOMAINS — never for real customer domains.
 */
export function devLinkAllowed(email: string): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const domains = (process.env.DEMO_LOGIN_DOMAINS || "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  return domains.includes(email.split("@")[1]?.toLowerCase() ?? "");
}
