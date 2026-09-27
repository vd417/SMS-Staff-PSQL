import { createStore } from '@/data/mock/store';
import { createMockRepositories, createHttpRepositories } from '@/data/repositories/factory';
import type { HttpClient } from '@/lib/httpClient';

jest.mock('@react-native-async-storage/async-storage', () => {
  let mem: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
      clear: jest.fn(() => { mem = {}; return Promise.resolve(); }),
    },
  };
});
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

function fixtureHttp(): HttpClient {
  const tokenDTO = { access_token: 'mock-access-token', refresh_token: 'mock-refresh-token' };
  const meDTO = {
    id: 'staff_ramesh', tenant_id: 'school_greenfield', name: 'Ramesh Kumar',
    email: 'ramesh@example.com', phone: '98765 43210', employee: 'EMP-2041',
    joined: '2019-06-12', tenant_name: 'Greenfield Public School', role_key: 'driver',
  };
  const attendanceDTO = { checked_in: false, last_log: [], duty_post: 'Bus / Route', geofence_radius_m: 120 };
  const routes: Record<string, unknown> = {
    'POST /auth/otp/request': {},
    'POST /auth/otp/verify': tokenDTO,
    'GET /auth/me': meDTO,
    'GET /staff/attendance': attendanceDTO,
    'GET /me/attendance/school-location': { lat: 28.4595, lng: 77.0266, radius_meters: 120, name: 'Greenfield Public School' },
    'GET /staff/trip/assignment': {
      route: {
        id: 'route_7', name: 'Route 7', bus_no: 'HR-26-BX-4412',
        stops: [{ id: 'stop_1', name: 'School Gate', lat: 28.4595, lng: 77.0266, seq: 0 }],
      },
      bus_no: 'HR-26-BX-4412', conductor_name: 'Sita Devi',
    },
    'GET /staff/tasks': [{ id: 'task_1', title: 'X', priority: 'normal', done: false, due_label: 'x' }],
    'GET /leave/balances': [{ type: 'casual', total: 12, used: 4 }],
    'GET /leave': [{ id: 'lv_1', type: 'casual', from_date: '2026-05-20', to_date: '2026-05-21', reason: 'X', status: 'approved' }],
    'GET /staff/profile': { documents: [{ id: 'd1', label: 'L', value: 'V', ok: true }] },
  };
  return {
    get: <T>(path: string) => Promise.resolve(routes[`GET ${path}`] as T),
    post: <T>(path: string) => Promise.resolve(routes[`POST ${path}`] as T),
    patch: <T>() => Promise.resolve(undefined as T),
    delete: <T>() => Promise.resolve(undefined as T),
  };
}

const keys = (o: object) => Object.keys(o).sort();

describe('mock <-> http contract', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('verifyOtp returns the same Session shape from both adapters', async () => {
    const mock = createMockRepositories(await createStore());
    const http = createHttpRepositories(fixtureHttp());
    const a = await mock.auth.verifyOtp('98765 43210', '123456', 'driver');
    const b = await http.auth.verifyOtp('98765 43210', '123456', 'driver');
    expect(keys(a)).toEqual(keys(b));
    expect(keys(a.user)).toEqual(keys(b.user));
    expect(keys(a.tenant)).toEqual(keys(b.tenant));
    expect(a.user.roleKey).toBe(b.user.roleKey);
    expect(a.tenant.name).toBe(b.tenant.name);
  });

  it('trip.myAssignment returns the same TripAssignment shape from both adapters', async () => {
    const mock = createMockRepositories(await createStore());
    const http = createHttpRepositories(fixtureHttp());
    const a = await mock.trip.myAssignment();
    const b = await http.trip.myAssignment();
    expect(keys(a)).toEqual(keys(b));
    expect(keys(a.route)).toEqual(keys(b.route));
    expect(a.busNo).toBe(b.busNo);
    expect(a.conductorName).toBe(b.conductorName);
  });

  it('attendance.status returns the same Attendance shape from both adapters', async () => {
    const mock = createMockRepositories(await createStore());
    const http = createHttpRepositories(fixtureHttp());
    const a = await mock.attendance.status();
    const b = await http.attendance.status();
    expect(keys(a)).toEqual(keys(b));
    expect(a.checkedIn).toBe(b.checkedIn);
    expect(a.geofenceRadiusM).toBe(b.geofenceRadiusM);
  });

  it('attendance.schoolLocation returns the same SchoolLocation shape from both adapters', async () => {
    const mock = createMockRepositories(await createStore());
    const http = createHttpRepositories(fixtureHttp());
    const a = await mock.attendance.schoolLocation();
    const b = await http.attendance.schoolLocation();
    expect(keys(a)).toEqual(keys(b));
    expect(a.radiusMeters).toBe(b.radiusMeters);
  });

  it('tasks.list returns the same Task shape from both adapters', async () => {
    const mock = createMockRepositories(await createStore());
    const http = createHttpRepositories(fixtureHttp());
    const a = (await mock.tasks.list())[0];
    const b = (await http.tasks.list())[0];
    expect(keys(a)).toEqual(keys(b));
  });
  it('leave.summary returns the same LeaveSummary shape from both adapters', async () => {
    const mock = createMockRepositories(await createStore());
    const http = createHttpRepositories(fixtureHttp());
    const a = await mock.leave.summary();
    const b = await http.leave.summary();
    expect(keys(a)).toEqual(keys(b));
    expect(keys(a.balances[0])).toEqual(keys(b.balances[0]));
    expect(keys(a.requests[0])).toEqual(keys(b.requests[0]));
  });
  it('profile.get returns the same Profile shape from both adapters', async () => {
    const mock = createMockRepositories(await createStore());
    const http = createHttpRepositories(fixtureHttp());
    const a = await mock.profile.get();
    const b = await http.profile.get();
    expect(keys(a.documents[0])).toEqual(keys(b.documents[0]));
  });
});
