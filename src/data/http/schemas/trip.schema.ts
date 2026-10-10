import { z } from 'zod';
import { opt, orEmpty } from './wire';

const stopSchema = z.object({ id: z.string(), name: z.string(), lat: z.number(), lng: z.number(), seq: z.number(), eta_min: opt(z.number()) });
const routeSchema = z.object({ id: z.string(), name: z.string(), bus_no: z.string(), stops: z.array(stopSchema) });

export const tripAssignmentSchema = z.object({
  route: routeSchema,
  bus_id: z.string(),
  bus_no: z.string(),
  driver_name: z.string().nullish(),
  conductor_name: z.string().nullish(),
  shift: opt(z.string()),
  students_assigned: z.number(),
});

export const tripSchema = z.object({
  id: z.string(),
  route_id: orEmpty,
  bus_no: orEmpty,
  driver_id: orEmpty,
  conductor_id: opt(z.string()),
  direction: z.enum(['pickup', 'drop']),
  status: z.enum(['live', 'arrived', 'ended']),
  started_at: opt(z.string()),
  ended_at: opt(z.string()),
  active_broadcaster: opt(z.enum(['driver', 'conductor'])),
  current_stop_id: opt(z.string()),
});

export const tripSummarySchema = z.object({
  trip_id: z.string(), duration_min: z.number(), distance_km: z.number(), stops_covered: z.number(), boarded_count: z.number(),
});

export const rosterSchema = z.array(z.object({ id: z.string(), name: z.string(), stop_id: orEmpty, photo_url: opt(z.string()) }));

export const boardingListSchema = z.array(z.object({
  trip_id: z.string(), student_id: z.string(), stop_id: orEmpty, state: z.enum(['boarded', 'dropped', 'absent']), at: z.string(),
}));

// sms-api's GET /staff/trips/{id}/stops returns a bare, seq-ordered array of RouteStops joined
// with per-trip progress, each row carrying a server-computed `status`. There is no wrapper
// object: the trip id is known by the caller and school arrival is not surfaced here.
export const tripStopsSchema = z.array(z.object({
  id: z.string(), name: z.string(), lat: z.number(), lng: z.number(), seq: z.number(),
  status: z.enum(['completed', 'current', 'arrived', 'pending']),
  arrived_at: opt(z.string()), departed_at: opt(z.string()),
}));
