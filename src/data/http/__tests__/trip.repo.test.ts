import { httpTrip } from '@/data/http/trip.repo';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(routes: Record<string, unknown>): { http: HttpClient; calls: Array<{ method: string; path: string; body?: unknown }> } {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const http: HttpClient = {
    get: <T>(path: string) => { calls.push({ method: 'GET', path }); return Promise.resolve(routes[`GET ${path}`] as T); },
    post: <T>(path: string, body?: unknown) => { calls.push({ method: 'POST', path, body }); return Promise.resolve(routes[`POST ${path}`] as T); },
    patch: <T>(path: string, body?: unknown) => { calls.push({ method: 'PATCH', path, body }); return Promise.resolve(routes[`PATCH ${path}`] as T); },
    delete: <T>(path: string) => { calls.push({ method: 'DELETE', path }); return Promise.resolve(routes[`DELETE ${path}`] as T); },
  };
  return { http, calls };
}

describe('httpTrip.startTrip', () => {
  // Trip_Start resolves BusId by (TenantId, BusNo); omitting bus_no leaves the trip
  // unbound to any bus and the live fleet query (joins on BusId) never picks it up.
  it('sends bus_no alongside route_id and direction', async () => {
    const { http, calls } = fakeHttp({
      'POST /staff/trips': {
        id: 't1', route_id: 'r1', bus_no: 'HR-26-BX-4412', driver_id: 'd1',
        direction: 'pickup', status: 'live',
      },
    });
    await httpTrip(http).startTrip('r1', 'pickup', 'HR-26-BX-4412');
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/staff/trips',
      body: { route_id: 'r1', bus_no: 'HR-26-BX-4412', direction: 'pickup' },
    });
  });
});

describe('httpTrip.publishPings', () => {
  it('posts the batch in the BulkPingRequest shape', async () => {
    const { http, calls } = fakeHttp({ 'POST /staff/trips/t1/pings': undefined });
    await httpTrip(http).publishPings('t1', [
      { tripId: 't1', lat: 12.9, lng: 77.6, speedKmh: 32, heading: 90, at: '2026-08-29T00:00:00Z' },
      { tripId: 't1', lat: 12.91, lng: 77.61, speedKmh: 30, heading: 92, at: '2026-08-29T00:00:10Z' },
    ]);
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/staff/trips/t1/pings',
      body: { pings: [
        { lat: 12.9, lng: 77.6, speed_kmh: 32, heading: 90, at: '2026-08-29T00:00:00Z' },
        { lat: 12.91, lng: 77.61, speed_kmh: 30, heading: 92, at: '2026-08-29T00:00:10Z' },
      ] },
    });
  });
});
