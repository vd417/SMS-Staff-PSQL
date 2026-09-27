import type { TripRepository } from '@/data/repositories/types';
import type {
  TripAssignment, Trip, TripPing, TripSummary, StudentLite, Boarding, TripDirection,
} from '@/data/domain';
import type { Store } from './store';
import { simulateLatency } from '@/lib/latency';

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
      return store.currentTrip ? clone(store.currentTrip) : null;
    },

    async startTrip(routeId: string, direction: TripDirection, _busNo: string): Promise<Trip> {
      await simulateLatency();
      // Single active broadcaster: if a trip is already live, return it unchanged.
      if (store.currentTrip && store.currentTrip.status === 'live') {
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
      await store.persistTrip();
      return clone(trip);
    },

    async publishPing(ping: TripPing): Promise<void> {
      await simulateLatency();
      if (!store.currentTrip || store.currentTrip.status !== 'live') return;
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
  };
}
