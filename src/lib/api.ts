import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { Role, User } from "@prisma/client";
import { getUser } from "./auth";

/** English error copy with a stable machine-readable `code`; the clients translate by code. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

export const unauthorized = () => new ApiError(401, "unauthorized", "Sign in to continue.");
export const forbidden = () => new ApiError(403, "forbidden", "You don't have access to this.");
export const notFound = (what = "Item") => new ApiError(404, "not_found", `${what} not found.`);
export const bad = (code: string, message: string, fields?: Record<string, string>) => new ApiError(400, code, message, fields);

export async function requireUser(...roles: Role[]): Promise<User> {
  const user = await getUser();
  if (!user) throw unauthorized();
  if (roles.length && !roles.includes(user.role)) throw forbidden();
  return user;
}

/** A company admin or manager, with the company they act for. Managers are scoped to their own team. */
export async function requireCompanyStaff(): Promise<User & { companyId: string }> {
  const user = await requireUser("company_admin", "manager");
  if (!user.companyId) throw forbidden();
  return user as User & { companyId: string };
}

export async function requireCompanyAdmin(): Promise<User & { companyId: string }> {
  const user = await requireUser("company_admin");
  if (!user.companyId) throw forbidden();
  return user as User & { companyId: string };
}

export const requireSystemAdmin = () => requireUser("system_admin");

/** Team filter for manager-scoped queries (company admins see everyone). */
export function teamScope(user: User): { team?: string } {
  return user.role === "manager" && user.team ? { team: user.team } : {};
}

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: JSON out, ApiError/Zod errors mapped to status codes. */
export function route<P = Record<string, string>>(fn: (req: Request, params: P) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const out = await fn(req, await ctx.params);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: { code: e.code, message: e.message, fields: e.fields } }, { status: e.status });
      if (e instanceof ZodError) {
        const fields: Record<string, string> = {};
        for (const i of e.issues) fields[i.path.join(".")] = i.message;
        return NextResponse.json({ error: { code: "invalid", message: "Check the highlighted fields.", fields } }, { status: 422 });
      }
      console.error(e);
      return NextResponse.json({ error: { code: "server", message: "Something went wrong. Please try again." } }, { status: 500 });
    }
  };
}

/** Tiny in-memory sliding window; fine for a single instance. */
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new ApiError(429, "rate_limited", "Too many requests. Wait a moment.");
  list.push(now);
  hits.set(key, list);
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

export async function audit(companyId: string | null, actorId: string | null, action: string, entity: string, entityId: string | null, data?: unknown) {
  const { db } = await import("./db");
  await db.auditLog.create({ data: { companyId, actorId, action, entity, entityId, data: data === undefined ? undefined : (data as object) } });
}
