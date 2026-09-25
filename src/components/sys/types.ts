export type Minor = { minor: number | null; serial: string; placedAt: string | null; status: "stock" | "shipped" | "supplied" | "active"; health: "online" | "low" | "offline" | "unknown" | null };
export type Company = {
  id: string; major: number; name: string; code: string; status: "onboarding" | "active"; adminEmail: string | null; createdAt: string;
  locations: number; users: number; beaconsActive: number; beaconsTotal: number;
  awayMinutes: number; passLockMinutes: number; ssoDomains: string | null; ssoIssuer: string | null; ssoClientId: string | null; ssoConfigured: boolean;
  minors: Minor[];
};
