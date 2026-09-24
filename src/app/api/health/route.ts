import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** App Platform health check. Touches the database so a deploy that can't reach Postgres rolls back. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "db" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
