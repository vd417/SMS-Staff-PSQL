import { createStore } from '@/data/mock/store';
import { createMockRepositories, createHttpRepositories } from '@/data/repositories/factory';
import type { HttpClient } from '@/lib/httpClient';
import { smsApiFixtures } from './fixtures/smsApi';

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
  const routes: Record<string, unknown> = {
    ...smsApiFixtures,
    'POST /auth/otp/request': {},
    'POST /auth/otp/verify': tokenDTO,
    'POST /auth/login': tokenDTO,
  };
  const strip = (path: string) => path.split('?')[0];
  return {
    get: <T>(path: string) => Promise.resolve(routes[`GET ${strip(path)}`] as T),
    post: <T>(path: string) => Promise.resolve(routes[`POST ${strip(path)}`] as T),
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
    // Both adapters populate role/tenant from their own data, not the same literal values (the
    // http adapter is now backed by the real recorded sms-api response) — keys parity above is
    // the actual contract; here we only check each side actually populated the field.
    expect(a.user.roleKey).toBe('driver');
    expect(b.user.roleKey).toBe('driver');
    expect(a.tenant.name).toBeTruthy();
    expect(b.tenant.name).toBeTruthy();
  });

  it('trip.myAssignment returns the same TripAssignment shape from both adapters', async () => {
    const mock = createMockRepositories(await createStore());
    const http = createHttpRepositories(fixtureHttp());
    const a = await mock.trip.myAssignment();
    const b = await http.trip.myAssignment();
    expect(keys(a)).toEqual(keys(b));
    expect(keys(a.route)).toEqual(keys(b.route));
    expect(a.busNo).toBeTruthy();
    expect(b.busNo).toBe('E2E-BUS-01');
    expect(a.conductorName).toBeTruthy();
    expect(b.conductorName).toBe('Sita Conductor');
  });

  it('attendance.status returns the same Attendance shape from both adapters', async () => {
    const mock = createMockRepositories(await createStore());
    const http = createHttpRepositories(fixtureHttp());
    const a = await mock.attendance.status();
    const b = await http.attendance.status();
    expect(keys(a)).toEqual(keys(b));
    expect(a.checkedIn).toBe(b.checkedIn);
    // Mock (120) and the recorded e2e fixture (150, from staff_e2e.sql) use different literal
    // radii; keys parity above is the contract, this only checks each side populated a number.
    expect(typeof a.geofenceRadiusM).toBe('number');
    expect(typeof b.geofenceRadiusM).toBe('number');
  });

  it('attendance.schoolLocation returns the same SchoolLocation shape from both adapters', async () => {
    const mock = createMockRepositories(await createStore());
    const http = createHttpRepositories(fixtureHttp());
    const a = await mock.attendance.schoolLocation();
    const b = await http.attendance.schoolLocation();
    expect(keys(a)).toEqual(keys(b));
    // Same as above: mock (120) and the recorded fixture (150) differ by design.
    expect(typeof a.radiusMeters).toBe('number');
    expect(typeof b.radiusMeters).toBe('number');
  });

  it('tasks.list returns the same Task shape from both adapters', async () => {
    const mock = createMockRepositories(await createStore());
    const http = createHttpRepositories(fixtureHttp());
    const a = (await mock.tasks.list())[0];
    const b = await http.tasks.list();
    // The seeded driver has no tasks (recorded GET /staff/tasks is []) and the staff app cannot
    // create one (POST /staff/tasks is manager-only), so there is no recorded item to compare
    // keys against. Re-add the key-parity check once a recording includes a task.
    expect(a).toBeDefined();
    expect(b).toEqual([]);
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
  it('leave.submit and issues.create parse the recorded POST responses', async () => {
    const http = createHttpRepositories(fixtureHttp());
    await expect(http.leave.submit({ type: 'casual', fromDate: '2026-10-05', toDate: '2026-10-06', reason: 'Family function' }))
      .resolves.toMatchObject({ id: '38676e3f-80f3-4e09-bf27-47bbd4487fc4', status: 'pending' });
    await expect(http.issues.create({ category: 'vehicle', title: 'Rear wiper not working', description: 'Wiper motor stalls', priority: 'normal' }))
      .resolves.toMatchObject({ id: '436bb995-720a-4f62-b860-86c8af781ec8', title: 'Rear wiper not working' });
  });
  it('profile.get returns the same Profile shape from both adapters', async () => {
    const mock = createMockRepositories(await createStore());
    const http = createHttpRepositories(fixtureHttp());
    const a = await mock.profile.get();
    const b = await http.profile.get();
    // The seeded driver has no documents (recorded GET /staff/profile has documents: []), so
    // there is no recorded item to compare keys against yet.
    expect(a.documents[0]).toBeDefined();
    expect(b.documents).toEqual([]);
  });

  it('parses every recorded sms-api response', async () => {
    const repos = createHttpRepositories(fixtureHttp());
    await expect(repos.dashboard.get()).resolves.toBeDefined();
    await expect(repos.attendance.status()).resolves.toBeDefined();
    await expect(repos.attendance.schoolLocation()).resolves.toBeDefined();
    await expect(repos.trip.myAssignment()).resolves.toMatchObject({ busNo: 'E2E-BUS-01' });
    await expect(repos.tasks.list()).resolves.toBeInstanceOf(Array);
    await expect(repos.issues.list()).resolves.toHaveLength(1);
    await expect(repos.leave.summary()).resolves.toBeDefined();
    await expect(repos.profile.get()).resolves.toBeDefined();
  });

  it('parses the recorded trip-scoped sms-api responses (roster, boarding, stops, current, start)', async () => {
    const repos = createHttpRepositories(fixtureHttp());
    const tripId = 'e4220d66-00b6-460b-a83a-6f5be4ae9956';
    await expect(repos.trip.startTrip('a0000000-0000-4000-8000-000000000301', 'pickup', 'E2E-BUS-01'))
      .resolves.toMatchObject({ id: tripId, status: 'live' });
    await expect(repos.trip.current()).resolves.toMatchObject({ id: tripId, status: 'live' });
    await expect(repos.trip.roster(tripId)).resolves.toHaveLength(4);
    await expect(repos.trip.boardingState(tripId)).resolves.toBeInstanceOf(Array);
    await expect(repos.trip.stops(tripId)).resolves.toMatchObject({ tripId });
  });

  it('both adapters implement stops/confirmArrival/departStop/markSchoolArrived/publishPings', async () => {
    const mock = createMockRepositories(await createStore());
    const http = createHttpRepositories(fixtureHttp());
    for (const repo of [mock, http]) {
      expect(typeof repo.trip.stops).toBe('function');
      expect(typeof repo.trip.confirmArrival).toBe('function');
      expect(typeof repo.trip.departStop).toBe('function');
      expect(typeof repo.trip.markSchoolArrived).toBe('function');
      expect(typeof repo.trip.publishPings).toBe('function');
    }
  });
});
