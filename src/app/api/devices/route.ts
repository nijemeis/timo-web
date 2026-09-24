import { z } from "zod";
import { requireUser, route } from "@/lib/api";
import { db } from "@/lib/db";

const Body = z.object({
  installId: z.string().min(8).max(100),
  platform: z.enum(["ios", "android"]),
  model: z.string().max(100).nullish(),
  appVersion: z.string().max(40).nullish(),
  pushToken: z.string().max(400).nullish(),
});

/** Register (or refresh) this phone. Returns the device id the events endpoint needs. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const b = Body.parse(await req.json());
  const d = await db.device.upsert({
    where: { userId_installId: { userId: user.id, installId: b.installId } },
    create: { userId: user.id, ...b, lastSeenAt: new Date() },
    update: { platform: b.platform, model: b.model, appVersion: b.appVersion, pushToken: b.pushToken ?? undefined, lastSeenAt: new Date() },
  });
  const ack = await db.beaconEvent.aggregate({ where: { deviceId: d.id }, _max: { seq: true } });
  return { deviceId: d.id, ackSeq: ack._max.seq ?? 0 };
});
