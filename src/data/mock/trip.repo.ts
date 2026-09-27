import type { TripRepository } from '@/data/repositories/types';
import type {
  TripAssignment, Trip, TripPing, TripSummary, StudentLite, Boarding, TripDirection, TripStops,
} from '@/data/domain';
import type { Store } from './store';
import { simulateLatency } from '@/lib/latency';
import { AppError } from '@/lib/errors';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function mockTrip(store: Store): TripRepository {
  return {
    async myAssignment(): Promise<TripAssignment> {
      await simulateLatency();
      const driverCard = store.roleCards.driver;
      return clone({
        route: store.route,
        busId: store.busId,
        busNo: store.route.assignedBusNo,
        driverName: store.session.user.name,
        conductorName: store.conductorName,
        shift: driverCard.kind === 'driver' ? driverCard.shift : undefined,
        studentsAssigned: driverCard.kind === 'driver' ? driverCard.studentsAssigned : 0,
      });
    },

    async current(): Promise<Trip | null> {
      await simulateLatency();
      if (!store.currentTrip) return null;
      return clone({ ...store.currentTrip, currentStopId: store.tripStops.currentStopId ?? undefined });
    },

    async startTrip(routeId: string, direction: TripDirection, _busNo: string): Promise<Trip> {
      await simulateLatency();
      // Single active broadcaster: if a trip is already live or arrived, return it unchanged
      // (mirrors the server's bus_already_active over live|arrived).
      if (store.currentTrip && (store.currentTrip.status === 'live' || store.currentTrip.status === 'arrived')) {
        return clone(store.currentTrip);
      }
      const trip: Trip = {
        id: store.genId('trip'),
        routeId,
        busNo: store.route.assignedBusNo,
        driverId: store.session.user.id,
        direction,
        status: 'live',
        startedAt: new Date().toISOString(),
        activeBroadcaster: 'driver',
      };
      store.currentTrip = trip;
      store.boarding = [];
      store.pings = [];
      store.tripStops = { currentStopId: null, schoolArrivedAt: null, arrived: {}, departed: {} };
      await store.persistTrip();
      return clone(trip);
    },

    async publishPing(ping: TripPing): Promise<void> {
      await simulateLatency();
      if (!store.currentTrip || (store.currentTrip.status !== 'live' && store.currentTrip.status !== 'arrived')) return;
      store.pings.push(ping);
      if (store.pings.length > 500) store.pings.shift();
    },

    async endTrip(tripId: string): Promise<TripSummary> {
      await simulateLatency();
      const trip = store.currentTrip;
      const startedMs = trip?.startedAt ? Date.parse(trip.startedAt) : Date.now();
      const durationMin = Math.max(0, Math.round((Date.now() - startedMs) / 60000));
      const boardedCount = store.boarding.filter((b) => b.state === 'boarded').length;
      const summary: TripSummary = {
        tripId,
        durationMin,
        distanceKm: Math.round((store.pings.length * 0.05) * 10) / 10,
        stopsCovered: store.route.stops.length,
        boardedCount,
      };
      if (trip) {
        trip.status = 'ended';
        trip.endedAt = new Date().toISOString();
      }
      store.currentTrip = null;
      await store.persistTrip();
      return summary;
    },

    async roster(_tripId: string): Promise<StudentLite[]> {
      await simulateLatency();
      return clone(store.students);
    },

    async setBoarding(b: Boarding): Promise<void> {
      await simulateLatency();
      const idx = store.boarding.findIndex((x) => x.studentId === b.studentId);
      if (idx >= 0) store.boarding[idx] = b;
      else store.boarding.push(b);
      await store.persistTrip();
    },

    async boardingState(_tripId: string): Promise<Boarding[]> {
      await simulateLatency();
      return clone(store.boarding);
    },

    async stops(tripId: string): Promise<TripStops> {
      await simulateLatency();
      const p = store.tripStops;
      return {
        tripId,
        currentStopId: p.currentStopId,
        schoolArrivedAt: p.schoolArrivedAt,
        stops: [...store.route.stops].sort((a, b) => a.seq - b.seq).map((s) => ({
          stopId: s.id, name: s.name, seq: s.seq,
          arrivedAt: p.arrived[s.id], confirmedAt: p.arrived[s.id], departedAt: p.departed[s.id],
        })),
      };
    },

    // Same rules as sms-api TripService (sequence, current stop, pickup-only school arrival);
    // no GPS radius check — there is no real location in mock mode.
    async confirmArrival(_tripId: string, stopId: string): Promise<void> {
      await simulateLatency();
      const p = store.tripStops;
      if (p.currentStopId === stopId) throw new AppError('already_at_stop', 409, 'this stop is already confirmed as current');
      if (p.currentStopId) throw new AppError('wrong_stop_order', 409, 'a different stop is already current');
      const next = [...store.route.stops].sort((a, b) => a.seq - b.seq).find((s) => !p.departed[s.id]);
      if (!next || next.id !== stopId) throw new AppError('wrong_stop_order', 409, 'stops must be confirmed in sequence');
      p.arrived[stopId] = new Date().toISOString();
      p.currentStopId = stopId;
    },

    async departStop(_tripId: string, stopId: string): Promise<void> {
      await simulateLatency();
      const p = store.tripStops;
      if (p.currentStopId !== stopId) throw new AppError('not_current_stop', 409, 'this stop is not the confirmed current stop');
      p.departed[stopId] = new Date().toISOString();
      p.currentStopId = null;
    },

    async markSchoolArrived(_tripId: string): Promise<void> {
      await simulateLatency();
      const trip = store.currentTrip;
      if (!trip || trip.direction !== 'pickup' || trip.status !== 'live') {
        throw new AppError('invalid_state', 409, 'not a pickup trip in progress');
      }
      store.tripStops.schoolArrivedAt = new Date().toISOString();
      trip.status = 'arrived';
      await store.persistTrip();
    },
  };
}
