/**
 * Timo beacon identity. The proximity UUID is the estate UUID shared with the owner's other beacon apps
 * (Dealiteful, Luggo, Whemma, NoGo) — a deliberate decision. Majors identify companies; minors identify
 * one beacon within a company. The mobile apps only act on (major, minor) pairs from /api/me/beacon-config.
 */
export const TIMO_UUID = "A1CA9F6B-CFC3-4DC6-9A4D-B4FB1B691C3D";
/** First major handed out when no company exists yet. */
export const FIRST_MAJOR = 1001;
export const LOW_BATTERY = 20;
export const OFFLINE_AFTER_MS = 3600_000;

export type BeaconHealth = "online" | "low" | "offline" | "unknown";

export function beaconHealth(b: { battery: number | null; lastSeenAt: Date | null }, now = new Date()): BeaconHealth {
  if (!b.lastSeenAt) return "unknown";
  if (now.getTime() - b.lastSeenAt.getTime() > OFFLINE_AFTER_MS) return "offline";
  if (b.battery != null && b.battery < LOW_BATTERY) return "low";
  return "online";
}

/** Company self-registration code: initials of the first two words + major, e.g. "Northpier Logistics" → NP-1042. */
export function companyCode(name: string, major: number): string {
  const letters = name
    .normalize("NFD")
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase());
  const prefix = (letters.length >= 2 ? letters.slice(0, 2).join("") : (name.replace(/[^A-Za-z]/g, "").slice(0, 2) || "TM").toUpperCase());
  return `${prefix}-${major}`;
}

export const requestRef = (n: number) => `R-${String(n).padStart(4, "0")}`;
