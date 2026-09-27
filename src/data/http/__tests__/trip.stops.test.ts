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
  it('reads GET /staff/trips/{id}/stops', async () => {
    const { http } = fakeHttp({
      'GET /staff/trips/t1/stops': {
        trip_id: 't1', current_stop_id: 's1', school_arrived_at: null,
        stops: [
          { stop_id: 's1', name: 'A', seq: 1, arrived_at: '2026-09-26T02:05:00Z', confirmed_at: '2026-09-26T02:05:00Z', departed_at: null },
          { stop_id: 's2', name: 'B', seq: 2, arrived_at: null, confirmed_at: null, departed_at: null },
        ],
      },
    });
    await expect(httpTrip(http).stops('t1')).resolves.toEqual({
      tripId: 't1', currentStopId: 's1', schoolArrivedAt: null,
      stops: [
        { stopId: 's1', name: 'A', seq: 1, arrivedAt: '2026-09-26T02:05:00Z', confirmedAt: '2026-09-26T02:05:00Z', departedAt: undefined },
        { stopId: 's2', name: 'B', seq: 2, arrivedAt: undefined, confirmedAt: undefined, departedAt: undefined },
      ],
    });
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
