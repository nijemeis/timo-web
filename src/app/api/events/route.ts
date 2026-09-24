import { z } from "zod";
import { bad, requireUser, route } from "@/lib/api";
import { ingestEvents } from "@/lib/events";

const Body = z.object({
  deviceId: z.string().min(1),
  events: z.array(z.object({
    seq: z.number().int().nonnegative(),
    type: z.enum(["enter", "exit"]),
    uuid: z.string().min(32).max(40),
    major: z.number().int().min(0).max(65535),
    minor: z.number().int().min(0).max(65535),
    at: z.string().datetime({ offset: true }),
    rssi: z.number().int().nullish(),
  })).max(500),
});

/** Batched beacon events from a phone, idempotent via deviceId + seq. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const b = Body.parse(await req.json());
  try {
    return await ingestEvents(user, b.deviceId, b.events);
  } catch (e) {
    if ((e as { code?: string }).code === "unknown_device") throw bad("unknown_device", "Register this device first.");
    throw e;
  }
});
