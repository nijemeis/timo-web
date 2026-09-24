import { requireUser, route } from "@/lib/api";
import { db } from "@/lib/db";
import { TIMO_UUID } from "@/lib/beacon";
import type { BeaconConfig } from "@/lib/types";

/** Everything the phone's native layer needs: the UUID, the company's major and its placed beacons. */
export const GET = route(async (): Promise<BeaconConfig> => {
  const user = await requireUser();
  const company = user.companyId ? await db.company.findUnique({ where: { id: user.companyId } }) : null;
  if (!company) return { uuid: TIMO_UUID, major: null, beacons: [], graceMinutes: 3 };
  const beacons = await db.beacon.findMany({ where: { companyId: company.id, major: company.major, status: "active" }, include: { location: true }, orderBy: { minor: "asc" } });
  return {
    uuid: TIMO_UUID,
    major: company.major,
    graceMinutes: company.graceMinutes,
    beacons: beacons.map((b) => ({ minor: b.minor!, locationId: b.locationId, location: b.location?.name ?? "", spot: b.spot ?? "", placement: b.placement })),
  };
});
