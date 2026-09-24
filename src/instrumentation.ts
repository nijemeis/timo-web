/**
 * Next.js instrumentation hook: close registrations nobody checked out of (23:59, status auto) every five
 * minutes, and release the Prisma pool when App Platform stops the container. Node APIs live in
 * instrumentation-node.ts so the Edge bundle never sees them.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startNode } = await import("./instrumentation-node");
    startNode();
  }
}
