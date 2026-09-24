import { z } from "zod";

export const CorrectionBody = z.object({
  type: z.enum(["forgot_checkout", "wrong_times", "missing"]),
  checkIn: z.string().regex(/^\d{1,2}:\d{2}$/, "HH:MM"),
  checkOut: z.string().regex(/^\d{1,2}:\d{2}$/, "HH:MM"),
  date: z.string().optional(),
  locationId: z.string().nullish(),
  note: z.string().max(500).nullish(),
});

export const LocationBody = z.object({
  name: z.string().trim().min(2, "Name the location.").max(80),
  short: z.string().trim().max(8).nullish(),
  capacity: z.number().int().min(1).max(10000),
  timezone: z.string().optional(),
});
