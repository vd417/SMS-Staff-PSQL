import type { TripRepository } from '@/data/repositories/types';
import type { TripPing, Boarding, TripDirection } from '@/data/domain';
import type { HttpClient } from '@/lib/httpClient';
import { toTripAssignment, toTrip, toTripSummary, toStudentLite, toBoarding } from './mappers';
import { parseWire } from './schemas/wire';
import { tripAssignmentSchema, tripSchema, tripSummarySchema, rosterSchema, boardingListSchema } from './schemas/trip.schema';

export function httpTrip(http: HttpClient): TripRepository {
  return {
    myAssignment: () =>
      http.get('/staff/trip/assignment').then((d) => toTripAssignment(parseWire(tripAssignmentSchema, d, 'trip assignment'))),
    current: () =>
      http.get('/staff/trip/current').then((d) => (d ? toTrip(parseWire(tripSchema, d, 'current trip')) : null)),
    // bus_no is required: sms-api resolves the bus (and its assigned driver/conductor) from it.
    startTrip: (routeId: string, direction: TripDirection, busNo: string) =>
      http.post('/staff/trips', { route_id: routeId, bus_no: busNo, direction }).then((d) => toTrip(parseWire(tripSchema, d, 'trip'))),
    publishPing: (ping: TripPing) =>
      http
        .post<void>(`/staff/trips/${ping.tripId}/pings`, {
          pings: [{ lat: ping.lat, lng: ping.lng, speed_kmh: ping.speedKmh, heading: ping.heading, at: ping.at }],
        })
        .then(() => undefined),
    endTrip: (tripId: string) =>
      http.post(`/staff/trips/${tripId}/end`, {}).then((d) => toTripSummary(parseWire(tripSummarySchema, d, 'trip summary'))),
    roster: (tripId: string) =>
      http.get(`/staff/trips/${tripId}/roster`).then((d) => parseWire(rosterSchema, d, 'roster').map(toStudentLite)),
    setBoarding: (b: Boarding) =>
      http
        .post<void>(`/staff/trips/${b.tripId}/boarding`, {
          // StopId is Guid? server-side: '' would fail model binding.
          student_id: b.studentId, stop_id: b.stopId || null, state: b.state, at: b.at,
        })
        .then(() => undefined),
    boardingState: (tripId: string) =>
      http.get(`/staff/trips/${tripId}/boarding`).then((d) => parseWire(boardingListSchema, d, 'boarding').map(toBoarding)),
  };
}
