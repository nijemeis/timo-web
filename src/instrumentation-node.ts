import { db } from "@/lib/db";
import { sweepAutoClose } from "@/lib/registrations";

/** Node-only side of instrumentation: the 23:59 auto check-out sweep and a clean pool shutdown. */
export function startNode() {
  const tick = () => sweepAutoClose().catch((e) => console.error("auto-close sweep failed", e));
  setTimeout(tick, 20_000);
  setInterval(tick, 5 * 60_000).unref();
  const bye = async () => { try { await db.$disconnect(); } finally { process.exit(0); } };
  process.once("SIGTERM", bye);
  process.once("SIGINT", bye);
}
