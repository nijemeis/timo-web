import { requireUser, route } from "@/lib/api";
import { db } from "@/lib/db";
import { TIMO_UUID } from "@/lib/beacon";
import { sweepAutoClose } from "@/lib/registrations";
import type { BeaconConfig } from "@/lib/types";

/** Everything the phone's native layer needs: the UUID, the company's major, its placed beacons, the pass rules and the current state. */
export const GET = route(async (): Promise<BeaconConfig> => {
  const user = await requireUser();
  const company = user.companyId ? await db.company.findUnique({ where: { id: user.companyId } }) : null;
  if (!company) return { uuid: TIMO_UUID, major: null, beacons: [], awayMinutes: 3, passLockMinutes: 15, open: null };
  await sweepAutoClose(new Date(), { userId: user.id });
  const [beacons, open] = await Promise.all([
    db.beacon.findMany({ where: { companyId: company.id, major: company.major, status: "active" }, include: { location: true }, orderBy: { minor: "asc" } }),
    db.registration.findFirst({ where: { userId: user.id, status: "open" }, orderBy: { checkInAt: "desc" } }),
  ]);
  return {
    uuid: TIMO_UUID,
    major: company.major,
    awayMinutes: company.awayMinutes,
    passLockMinutes: company.passLockMinutes,
    open: open ? { minor: open.minor, checkInAt: open.checkInAt.toISOString() } : null,
    beacons: beacons.map((b) => ({ minor: b.minor!, locationId: b.locationId, location: b.location?.name ?? "", spot: b.spot ?? "", placement: b.placement })),
  };
});
