import { httpAuth } from '@/data/http/auth.repo';
import { httpDashboard } from '@/data/http/dashboard.repo';
import { httpAttendance } from '@/data/http/attendance.repo';
import { httpLeave } from '@/data/http/leave.repo';
import { createHttpClient } from '@/lib/httpClient';
import { authSnapshot } from '@/lib/authSnapshot';
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

const meDTO = { id: 's1', tenant_id: 't1', name: 'R K', email: 'r@x.com', phone: '9876543210', employee: 'E', joined: '2020-01-01', tenant_name: 'School', role_key: 'driver' };

describe('http repositories', () => {
  it('auth.requestOtp posts the identifier and masks the destination', async () => {
    const { http, calls } = fakeHttp({ 'POST /auth/otp/request': {} });
    const challenge = await httpAuth(http).requestOtp('9876543210');
    expect(challenge.channel).toBe('sms');
    expect(challenge.destination).toBe('••••••3210');
    expect(calls[0]).toEqual({ method: 'POST', path: '/auth/otp/request', body: { identifier: '9876543210' } });
  });

  it('auth.requestOtp detects an email identifier', async () => {
    const { http } = fakeHttp({ 'POST /auth/otp/request': {} });
    const challenge = await httpAuth(http).requestOtp('r@x.com');
    expect(challenge.channel).toBe('email');
    expect(challenge.destination).toBe('r•@x.com');
  });

  it('auth.verifyOtp posts identifier + code, fetches /auth/me, and applies the client-chosen role', async () => {
    const { http, calls } = fakeHttp({
      'POST /auth/otp/verify': { access_token: 'a', refresh_token: 'r' },
      'GET /auth/me': meDTO,
    });
    const session = await httpAuth(http).verifyOtp('9876543210', '123456', 'driver');
    expect(session.accessToken).toBe('a');
    expect(session.user.roleKey).toBe('driver');
    expect(session.user.name).toBe('R K');
    expect(session.tenant.id).toBe('t1');
    expect(calls[0]).toEqual({ method: 'POST', path: '/auth/otp/verify', body: { identifier: '9876543210', code: '123456' } });
  });

  it('auth.verifyOtp carries the fresh access token as a Bearer header on the follow-up /auth/me call', async () => {
    // Regression test: /auth/me is [Authorize] on the real backend — a token
    // issued by /auth/otp/verify must be in the authSnapshot *before* the /auth/me
    // GET goes out, or that GET is sent with no Authorization header and 401s.
    authSnapshot.clear();
    const fetchMock = jest.fn((url: string, _init?: { headers?: Record<string, string> }) => {
      if (url.endsWith('/auth/otp/verify')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ data: { access_token: 'fresh-token', refresh_token: 'r' } }),
        });
      }
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ data: meDTO }),
      });
    });
    const http = createHttpClient({ baseUrl: 'https://api.test', getAuth: () => authSnapshot.get(), fetchImpl: fetchMock as never });
    await httpAuth(http).verifyOtp('9876543210', '123456', 'driver');
    const meCall = fetchMock.mock.calls.find(([url]) => (url as string).endsWith('/auth/me'));
    expect(meCall?.[1]?.headers?.Authorization).toBe('Bearer fresh-token');
  });

  it('auth.login posts email + password (no role), fetches /auth/me, and takes the role from role_key', async () => {
    const { http, calls } = fakeHttp({
      'POST /auth/login': { access_token: 'a', refresh_token: 'r' },
      'GET /auth/me': meDTO,
    });
    const session = await httpAuth(http).login('r@x.com', 'hunter2222', 'guard');
    expect(session.accessToken).toBe('a');
    expect(session.user.roleKey).toBe('driver');
    expect(calls[0]).toEqual({
      method: 'POST', path: '/auth/login',
      body: { email: 'r@x.com', password: 'hunter2222' },
    });
  });

  it('auth.login posts phone for a non-email identifier', async () => {
    const { http, calls } = fakeHttp({
      'POST /auth/login': { access_token: 'a', refresh_token: 'r' },
      'GET /auth/me': meDTO,
    });
    await httpAuth(http).login('9876543210', 'hunter2222', 'driver');
    expect(calls[0]).toEqual({
      method: 'POST', path: '/auth/login',
      body: { phone: '9876543210', password: 'hunter2222' },
    });
  });

  it('auth.setPassword posts the password to /auth/set-password', async () => {
    const { http, calls } = fakeHttp({ 'POST /auth/set-password': {} });
    await httpAuth(http).setPassword('hunter2222');
    expect(calls[0]).toEqual({ method: 'POST', path: '/auth/set-password', body: { password: 'hunter2222' } });
  });

  it('auth.logout posts the refresh_token in the body (backend requires it)', async () => {
    const { http, calls } = fakeHttp({ 'POST /auth/logout': {} });
    await httpAuth(http).logout('r-token');
    expect(calls[0]).toEqual({ method: 'POST', path: '/auth/logout', body: { refresh_token: 'r-token' } });
  });

  it('dashboard.get fetches and maps', async () => {
    const { http } = fakeHttp({
      'GET /staff/dashboard': {
        hours_this_week: 34, hours_target: 44, streak_days: 21, leave_left: 12,
        role_card: { kind: 'driver', busNo: 'X', routeName: 'R7', licenseExpiresInDays: 24, fitnessOk: true },
        pending_tasks_peek: [], alert: 'Meeting',
      },
    });
    const d = await httpDashboard(http).get();
    expect(d.hoursThisWeek).toBe(34);
    expect(d.roleCard?.kind).toBe('driver');
  });

  it('attendance.checkIn posts at + lat/lng/accuracy_meters and maps the result', async () => {
    const { http, calls } = fakeHttp({
      'POST /staff/attendance/check-in': {
        checked_in: true, check_in_at: '2026-06-03T08:00:00Z', last_log: [], duty_post: 'Bus / Route', geofence_radius_m: 120,
      },
    });
    const a = await httpAttendance(http).checkIn('2026-06-03T08:00:00Z', 28.4595, 77.0266, 8);
    expect(a.checkedIn).toBe(true);
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/staff/attendance/check-in',
      body: { at: '2026-06-03T08:00:00Z', lat: 28.4595, lng: 77.0266, accuracy_meters: 8, offset_minutes: -new Date().getTimezoneOffset() },
    });
  });

  it('attendance.checkOut posts at + lat/lng/accuracy_meters and maps the result', async () => {
    const { http, calls } = fakeHttp({
      'POST /staff/attendance/check-out': {
        checked_in: false, last_log: [], duty_post: 'Bus / Route', geofence_radius_m: 120,
      },
    });
    const a = await httpAttendance(http).checkOut('2026-06-03T15:30:00Z', 28.4595, 77.0266, 8);
    expect(a.checkedIn).toBe(false);
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/staff/attendance/check-out',
      body: { at: '2026-06-03T15:30:00Z', lat: 28.4595, lng: 77.0266, accuracy_meters: 8, offset_minutes: -new Date().getTimezoneOffset() },
    });
  });

  it('attendance.schoolLocation fetches and maps the geofence center', async () => {
    const { http, calls } = fakeHttp({
      'GET /me/attendance/school-location': { lat: 28.4595, lng: 77.0266, radius_meters: 120, name: 'Greenfield Public School' },
    });
    const loc = await httpAttendance(http).schoolLocation();
    expect(loc).toEqual({ lat: 28.4595, lng: 77.0266, radiusMeters: 120, name: 'Greenfield Public School' });
    expect(calls[0]).toEqual({ method: 'GET', path: '/me/attendance/school-location' });
  });

  it('leave.summary fetches balances + requests from the real /leave endpoints and maps both', async () => {
    const { http, calls } = fakeHttp({
      'GET /leave/balances': [{ type: 'casual', total: 12, used: 4 }, { type: 'sick', total: 8, used: 0 }],
      'GET /leave': [
        { id: 'lv_1', tenant_id: 't1', requester_id: 'u1', type: 'casual', from_date: '2026-05-20', to_date: '2026-05-21', reason: 'X', status: 'approved' },
      ],
    });
    const summary = await httpLeave(http).summary();
    expect(summary.balances).toEqual([{ type: 'casual', total: 12, used: 4 }, { type: 'sick', total: 8, used: 0 }]);
    expect(summary.requests).toEqual([{ id: 'lv_1', type: 'casual', fromDate: '2026-05-20', toDate: '2026-05-21', reason: 'X', status: 'approved' }]);
    expect(calls).toEqual(expect.arrayContaining([
      { method: 'GET', path: '/leave/balances' },
      { method: 'GET', path: '/leave' },
    ]));
  });

  it('leave.submit posts to /leave and maps the created request', async () => {
    const { http, calls } = fakeHttp({
      'POST /leave': { id: 'lv_2', tenant_id: 't1', type: 'sick', from_date: '2026-06-01', to_date: '2026-06-02', reason: 'Flu', status: 'pending' },
    });
    const created = await httpLeave(http).submit({ type: 'sick', fromDate: '2026-06-01', toDate: '2026-06-02', reason: 'Flu' });
    expect(created).toEqual({ id: 'lv_2', type: 'sick', fromDate: '2026-06-01', toDate: '2026-06-02', reason: 'Flu', status: 'pending' });
    expect(calls[0]).toEqual({ method: 'POST', path: '/leave', body: { type: 'sick', from_date: '2026-06-01', to_date: '2026-06-02', reason: 'Flu' } });
  });
});
