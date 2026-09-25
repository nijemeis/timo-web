/**
 * The mobile API contract. Copied verbatim to app/src/api/types.ts — change both.
 * All instants are ISO-8601 strings in UTC; clients format them in the location's time zone.
 */

export type Role = "employee" | "manager" | "company_admin" | "system_admin";
export type RegStatus = "open" | "ok" | "auto" | "pending";
export type Placement = "entrance" | "zone";

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export interface MeUser {
  id: string;
  name: string;
  email: string;
  team: string | null;
  role: Role;
  contractHours: number;
  locale: string | null;
}

export interface MeCompany {
  id: string;
  name: string;
  major: number;
  code: string;
  timezone: string;
  awayMinutes: number;
  passLockMinutes: number;
}

export interface LocationDTO {
  id: string;
  name: string;
  short: string | null;
  timezone: string;
}

export interface MeResponse {
  user: MeUser;
  /** Null for a user who registered without a company code: beacons then do nothing. */
  company: MeCompany | null;
  locations: LocationDTO[];
}

export interface BeaconConfigEntry {
  minor: number;
  locationId: string | null;
  location: string;
  spot: string;
  placement: Placement;
}

/** GET /api/me/beacon-config — everything the native layer needs to monitor and resolve beacons. */
export interface BeaconConfig {
  uuid: string;
  major: number | null;
  beacons: BeaconConfigEntry[];
  /** A sighting counts as a new pass only after the beacon was out of sight this long… */
  awayMinutes: number;
  /** …and at least this long after the previous pass. */
  passLockMinutes: number;
  /** The server's open registration, so a fresh install (or another phone) starts in the right state. */
  open: { minor: number | null; checkInAt: string } | null;
}

export interface RegistrationDTO {
  id: string;
  checkInAt: string;
  checkOutAt: string | null;
  status: RegStatus;
  source: "beacon" | "manual_correction" | "admin";
  major: number | null;
  minor: number | null;
  locationId: string | null;
  location: string | null;
  spot: string | null;
  timezone: string;
  /** Milliseconds that count towards totals (0 for auto; open ones up to "now" at response time). */
  countedMs: number;
  originalInAt: string | null;
  originalOutAt: string | null;
  correction: { id: string; status: "pending" | "approved" | "declined"; type: string; requestedIn: string; requestedOut: string; note: string | null } | null;
}

export interface SummaryResponse {
  now: string;
  open: RegistrationDTO | null;
  today: RegistrationDTO[];
  todayMs: number;
  weekMs: number;
  contractHours: number;
}

export interface RegistrationsResponse {
  items: RegistrationDTO[];
  totalMs: number;
}

/** One queued pass from the phone: "enter" = checked in by this pass, "exit" = checked out. `seq` is per device and strictly increasing. */
export interface BeaconEventIn {
  seq: number;
  type: "enter" | "exit";
  uuid: string;
  major: number;
  minor: number;
  at: string;
  rssi?: number | null;
}

export interface EventsRequest {
  deviceId: string;
  events: BeaconEventIn[];
}

export interface EventsResponse {
  accepted: number;
  duplicates: number;
  /** Highest seq the server has stored for this device; the phone can drop everything up to it. */
  ackSeq: number;
  open: RegistrationDTO | null;
}

export interface DeviceRequest {
  installId: string;
  platform: "ios" | "android";
  model?: string | null;
  appVersion?: string | null;
  pushToken?: string | null;
}

export interface CorrectionRequestBody {
  type: "forgot_checkout" | "wrong_times" | "missing";
  /** Local wall-clock times "HH:MM" on the registration's day (or `date` for a missing one). */
  checkIn: string;
  checkOut: string;
  date?: string;
  locationId?: string | null;
  note?: string | null;
}

export interface AuthResponse {
  token: string;
  user: MeUser;
}

export interface MagicLinkResponse {
  ok: true;
  /** Only when the server allows the shortcut (development / demo domains): the link's token. */
  devToken?: string;
}
