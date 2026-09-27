import { httpTrip } from '@/data/http/trip.repo';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(routes: Record<string, unknown>) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const http: HttpClient = {
    get: async <T>(path: string) => { calls.push({ method: 'GET', path }); return routes[`GET ${path}`] as T; },
    post: async <T>(path: string, body?: unknown) => { calls.push({ method: 'POST', path, body }); return routes[`POST ${path}`] as T; },
    patch: async <T>() => undefined as T,
    delete: async <T>() => undefined as T,
  };
  return { http, calls };
}

// Recorded sms-api TripResponse (staff): nullable ids, active_broadcaster, current_stop_id.
const tripWire = {
  id: 't1', tenant_id: 'ten', route_id: 'r1', bus_no: 'E2E-BUS-01', driver_id: 'd1', conductor_id: null,
  direction: 'pickup', status: 'arrived', started_at: '2026-09-26T02:00:00Z', ended_at: null,
  driver_last_ping_at: '2026-09-26T02:30:00Z', conductor_last_ping_at: null,
  active_broadcaster: 'driver', current_stop_id: 's2',
};

describe('trip wire', () => {
  it('maps a school-arrived trip with broadcaster and current stop', async () => {
    const { http } = fakeHttp({ 'GET /staff/trip/current': tripWire });
    const t = await httpTrip(http).current();
    expect(t).toMatchObject({ id: 't1', status: 'arrived', activeBroadcaster: 'driver', currentStopId: 's2', conductorId: undefined });
  });

  it('maps a null current trip to null', async () => {
    const { http } = fakeHttp({ 'GET /staff/trip/current': null });
    await expect(httpTrip(http).current()).resolves.toBeNull();
  });

  it('maps the assignment including driver_name', async () => {
    const { http } = fakeHttp({
      'GET /staff/trip/assignment': {
        route: { id: 'r1', name: 'E2E Route 1', bus_no: 'E2E-BUS-01', stops: [{ id: 's1', name: 'A', lat: 1, lng: 2, seq: 1, eta_min: null }] },
        bus_id: 'b1', bus_no: 'E2E-BUS-01', conductor_name: 'Sita', driver_name: 'Ramesh', shift: null, students_assigned: 4,
      },
    });
    const a = await httpTrip(http).myAssignment();
    expect(a).toMatchObject({ busId: 'b1', driverName: 'Ramesh', conductorName: 'Sita', shift: undefined, studentsAssigned: 4 });
    expect(a.route.stops[0].etaMin).toBeUndefined();
  });

  it('maps roster and boarding rows with a null stop to an empty stop id', async () => {
    const { http } = fakeHttp({
      'GET /staff/trips/t1/roster': [{ id: 'st1', name: 'Aarav', stop_id: null, photo_url: null }],
      'GET /staff/trips/t1/boarding': [{ trip_id: 't1', student_id: 'st1', stop_id: null, state: 'boarded', at: '2026-09-26T02:10:00Z' }],
    });
    await expect(httpTrip(http).roster('t1')).resolves.toEqual([{ id: 'st1', name: 'Aarav', stopId: '', photoUrl: undefined }]);
    await expect(httpTrip(http).boardingState('t1')).resolves.toEqual([{ tripId: 't1', studentId: 'st1', stopId: '', state: 'boarded', at: '2026-09-26T02:10:00Z' }]);
  });

  it('sends stop_id null for a student with no stop (Guid? on the server)', async () => {
    const { http, calls } = fakeHttp({ 'POST /staff/trips/t1/boarding': undefined });
    await httpTrip(http).setBoarding({ tripId: 't1', studentId: 'st1', stopId: '', state: 'boarded', at: 'x' });
    expect(calls[0].body).toEqual({ student_id: 'st1', stop_id: null, state: 'boarded', at: 'x' });
  });

  it('rejects an unknown trip status', async () => {
    const { http } = fakeHttp({ 'GET /staff/trip/current': { ...tripWire, status: 'paused' } });
    await expect(httpTrip(http).current()).rejects.toMatchObject({ code: 'contract_mismatch' });
  });
});
