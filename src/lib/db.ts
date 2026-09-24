import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client for the process. The pool size is pinned: Prisma's default
 * (physical CPUs × 2 + 1) reads the host CPU count, not the container's, so a 1-vCPU
 * App Platform instance would open ~20 connections. Production runs through a PgBouncer
 * pool (DATABASE_URL carries ?pgbouncer=true); migrations use DIRECT_DATABASE_URL.
 */
function databaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  const url = new URL(raw);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", process.env.DB_CONNECTION_LIMIT || "5");
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "15");
  return url.toString();
}

// Cached on globalThis in every environment so duplicated module evaluation still shares one pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForPrisma.prisma = db;
