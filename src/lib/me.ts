import "server-only";
import type { User } from "@prisma/client";
import { db } from "./db";
import type { MeResponse, MeUser } from "./types";

export const meUser = (u: User): MeUser => ({ id: u.id, name: u.name, email: u.email, team: u.team, role: u.role, contractHours: u.contractHours, locale: u.locale });

export async function meResponse(u: User): Promise<MeResponse> {
  const company = u.companyId ? await db.company.findUnique({ where: { id: u.companyId }, include: { locations: { orderBy: { createdAt: "asc" } } } }) : null;
  return {
    user: meUser(u),
    company: company ? { id: company.id, name: company.name, major: company.major, code: company.code, timezone: company.timezone, awayMinutes: company.awayMinutes, passLockMinutes: company.passLockMinutes } : null,
    locations: company?.locations.map((l) => ({ id: l.id, name: l.name, short: l.short, timezone: l.timezone })) ?? [],
  };
}
