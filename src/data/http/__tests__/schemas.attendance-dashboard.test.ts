import { httpAttendance } from '@/data/http/attendance.repo';
import { httpDashboard } from '@/data/http/dashboard.repo';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(routes: Record<string, unknown>) {
  const calls: Array<{ method: string; path: string; params?: unknown; body?: unknown }> = [];
  const http: HttpClient = {
    get: async <T>(path: string, params?: Record<string, unknown>) => { calls.push({ method: 'GET', path, params }); return routes[`GET ${path}`] as T; },
    post: async <T>(path: string, body?: unknown) => { calls.push({ method: 'POST', path, body }); return routes[`POST ${path}`] as T; },
    patch: async <T>() => undefined as T,
    delete: async <T>() => undefined as T,
  };
  return { http, calls };
}

// Shapes recorded from sms-api (StaffAttendanceResponse / DashboardResponse): nulls, not omissions.
const attendanceWire = {
  checked_in: true, check_in_at: '2026-09-26T03:10:00Z',
  last_log: [{ kind: 'in', at: '2026-09-26T03:10:00Z', in_zone: true }],
  duty_post: 'Greenfield E2E Main Gate', geofence_radius_m: 150,
};

describe('attendance wire', () => {
  it('maps last_log[].in_zone to inZone', async () => {
    const { http } = fakeHttp({ 'GET /staff/attendance': attendanceWire });
    const a = await httpAttendance(http).status();
    expect(a.lastLog).toEqual([{ kind: 'in', at: '2026-09-26T03:10:00Z', inZone: true }]);
  });

  it('treats a null check_in_at as absent and sends offset_minutes', async () => {
    const { http, calls } = fakeHttp({ 'GET /staff/attendance': { ...attendanceWire, checked_in: false, check_in_at: null, last_log: [] } });
    const a = await httpAttendance(http).status();
    expect(a.checkInAt).toBeUndefined();
    expect(calls[0].params).toEqual({ offset_minutes: -new Date().getTimezoneOffset() });
  });

  it('sends offset_minutes on check-in', async () => {
    const { http, calls } = fakeHttp({ 'POST /staff/attendance/check-in': attendanceWire });
    await httpAttendance(http).checkIn('2026-09-26T03:10:00Z', 28.4, 77.0, 12);
    expect(calls[0].body).toEqual({ at: '2026-09-26T03:10:00Z', lat: 28.4, lng: 77.0, accuracy_meters: 12, offset_minutes: -new Date().getTimezoneOffset() });
  });

  it('rejects a drifted shape with contract_mismatch', async () => {
    const { http } = fakeHttp({ 'GET /staff/attendance': { checkedIn: true } });
    await expect(httpAttendance(http).status()).rejects.toMatchObject({ code: 'contract_mismatch' });
  });
});

describe('dashboard wire', () => {
  it('leaves streak and leave-left undefined when sms-api does not send them', async () => {
    const { http } = fakeHttp({
      'GET /staff/dashboard': {
        hours_this_week: 12.5,
        role_card: { kind: 'driver', bus_no: 'E2E-BUS-01', route_name: 'E2E Route 1', shift: null, students_assigned: 4, on_board: 0, capacity: 40, next_stop: null },
      },
    });
    const d = await httpDashboard(http).get();
    expect(d.hoursThisWeek).toBe(12.5);
    expect(d.streakDays).toBeUndefined();
    expect(d.leaveLeft).toBeUndefined();
    expect(d.roleCard).toEqual({ kind: 'driver', busNo: 'E2E-BUS-01', routeName: 'E2E Route 1', shift: undefined, studentsAssigned: 4 });
  });

  it('accepts a null role_card', async () => {
    const { http } = fakeHttp({ 'GET /staff/dashboard': { hours_this_week: 0, role_card: null } });
    await expect(httpDashboard(http).get()).resolves.toMatchObject({ roleCard: null });
  });
});
