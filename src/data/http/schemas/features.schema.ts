import { z } from 'zod';
import { opt } from './wire';

export const taskSchema = z.object({
  id: z.string(), title: z.string(), detail: opt(z.string()), priority: z.enum(['urgent', 'normal']),
  done: z.boolean(), due_label: opt(z.string()), photo_url: opt(z.string()),
});
export const taskListSchema = z.array(taskSchema);

export const issueSchema = z.object({
  id: z.string(), category: z.string(), title: z.string(), description: z.string(), priority: z.string(), status: z.string(),
  vehicle_id: opt(z.string()), route_id: opt(z.string()), trip_id: opt(z.string()), photo_url: opt(z.string()), created_at: z.string(),
});
export const issueListSchema = z.array(issueSchema);

const leaveType = z.enum(['casual', 'sick', 'earned', 'medical', 'maternity', 'emergency', 'other']);
export const leaveBalancesSchema = z.array(z.object({ type: leaveType, total: z.number(), used: z.number() }));
export const leaveRequestSchema = z.object({
  id: z.string(), type: leaveType, from_date: z.string().nullable(), to_date: z.string().nullable(),
  reason: z.string().nullable(), status: z.enum(['pending', 'approved', 'rejected']),
});
export const leaveListSchema = z.array(leaveRequestSchema);

export const profileSchema = z.object({
  documents: z.array(z.object({ id: z.string(), label: z.string(), value: z.string(), ok: opt(z.boolean()) })),
  license_number: z.string().nullish(), license_expiry: z.string().nullish(),
  emergency_contact_name: z.string().nullish(), emergency_contact_phone: z.string().nullish(),
});

export const inspectionSchema = z.object({
  id: z.string(), bus_id: z.string(), brakes: z.boolean(), tyres: z.boolean(), lights: z.boolean(), horn: z.boolean(),
  first_aid_kit: z.boolean(), fire_extinguisher: z.boolean(), emergency_exit: z.boolean(), fuel_level: z.boolean(),
  all_ok: z.boolean(), remarks: z.string().nullish(), inspection_date: z.string(), created_at: z.string(),
});
export const inspectionListSchema = z.array(inspectionSchema);

export const fuelLogSchema = z.object({
  id: z.string(), bus_id: z.string(), odometer_km: z.number(), fuel_added_liters: z.number(), recorded_at: z.string(),
});
export const fuelLogListSchema = z.array(fuelLogSchema);

export const routeGeometrySchema = z.object({
  route_id: z.string(), status: z.enum(['available', 'unavailable']), format: z.string().nullable(), geometry: z.string().nullable(),
  distance_meters: z.number().nullable(), duration_seconds: z.number().nullable(),
  stop_sequence_hash: z.string(), generated_at: z.string().nullable(),
});
