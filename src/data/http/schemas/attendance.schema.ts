import { z } from 'zod';
import { opt, orEmpty } from './wire';

const logSchema = z
  .object({ at: z.string(), kind: z.enum(['in', 'out']), in_zone: z.boolean() })
  .transform((l) => ({ at: l.at, kind: l.kind, inZone: l.in_zone }));

export const attendanceSchema = z.object({
  checked_in: z.boolean(),
  check_in_at: opt(z.string()),
  last_log: z.array(logSchema),
  duty_post: orEmpty,
  geofence_radius_m: z.number(),
});

export const schoolLocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  radius_meters: z.number(),
  name: opt(z.string()),
});
