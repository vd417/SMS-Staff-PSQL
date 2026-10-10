import { httpTrip } from '@/data/http/trip.repo';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(routes: Record<string, unknown>) {
  const calls: Array<{ method: string; path: string }> = [];
  const http: HttpClient = {
    get: async <T>(path: string) => { calls.push({ method: 'GET', path }); return routes[`GET ${path}`] as T; },
    post: async <T>(path: string) => { calls.push({ method: 'POST', path }); return undefined as T; },
    patch: async <T>() => undefined as T,
    delete: async <T>() => undefined as T,
  };
  return { http, calls };
}

describe('httpTrip stop progress', () => {
  // sms-api returns a bare, seq-ordered array of stop rows with a server-computed `status`
  // (completed|current|arrived|pending) and no wrapper object; the trip id comes from the caller.
  it('maps GET /staff/trips/{id}/stops (server array) to domain TripStops', async () => {
    const { http } = fakeHttp({
      'GET /staff/trips/t1/stops': [
        { id: 's1', name: 'A', lat: 1, lng: 2, seq: 1, status: 'current', arrived_at: '2026-09-26T02:05:00Z', departed_at: null },
        { id: 's2', name: 'B', lat: 3, lng: 4, seq: 2, status: 'completed', arrived_at: '2026-09-26T02:00:00Z', departed_at: '2026-09-26T02:10:00Z' },
        { id: 's3', name: 'C', lat: 5, lng: 6, seq: 3, status: 'pending', arrived_at: null, departed_at: null },
      ],
    });
    await expect(httpTrip(http).stops('t1')).resolves.toEqual({
      tripId: 't1', currentStopId: 's1', schoolArrivedAt: null,
      stops: [
        { stopId: 's1', name: 'A', seq: 1, arrivedAt: '2026-09-26T02:05:00Z', departedAt: undefined },
        { stopId: 's2', name: 'B', seq: 2, arrivedAt: '2026-09-26T02:00:00Z', departedAt: '2026-09-26T02:10:00Z' },
        { stopId: 's3', name: 'C', seq: 3, arrivedAt: undefined, departedAt: undefined },
      ],
    });
  });

  // currentStopId is derived from the stop the server flagged `current`; none => null.
  it('derives currentStopId=null when no stop is current', async () => {
    const { http } = fakeHttp({
      'GET /staff/trips/t1/stops': [
        { id: 's1', name: 'A', lat: 1, lng: 2, seq: 1, status: 'completed', arrived_at: null, departed_at: '2026-09-26T02:10:00Z' },
        { id: 's2', name: 'B', lat: 3, lng: 4, seq: 2, status: 'pending', arrived_at: null, departed_at: null },
      ],
    });
    const r = await httpTrip(http).stops('t1');
    expect(r.currentStopId).toBeNull();
    expect(r.stops.find((s) => s.stopId === 's1')?.departedAt).toBe('2026-09-26T02:10:00Z');
  });

  it('posts the three stop actions to the sms-api routes', async () => {
    const { http, calls } = fakeHttp({});
    const repo = httpTrip(http);
    await repo.confirmArrival('t1', 's1');
    await repo.departStop('t1', 's1');
    await repo.markSchoolArrived('t1');
    expect(calls).toEqual([
      { method: 'POST', path: '/staff/trips/t1/stops/s1/confirm-arrival' },
      { method: 'POST', path: '/staff/trips/t1/stops/s1/complete' },
      { method: 'POST', path: '/staff/trips/t1/school-arrived' },
    ]);
  });
});
