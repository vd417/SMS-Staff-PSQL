import { createStore } from '@/data/mock/store';
import { mockTrip } from '@/data/mock/trip.repo';

jest.mock('@/lib/latency', () => ({ simulateLatency: () => Promise.resolve(), maybeFail: () => undefined }));
jest.mock('@react-native-async-storage/async-storage', () => {
  let mem: Record<string, string> = {};
  return { __esModule: true, default: {
    getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
    removeItem: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
    clear: jest.fn(() => { mem = {}; return Promise.resolve(); }),
  } };
});

async function started() {
  const store = await createStore();
  store.currentTrip = null;
  const repo = mockTrip(store);
  const trip = await repo.startTrip(store.route.id, 'pickup', store.route.assignedBusNo);
  const [first, second] = [...store.route.stops].sort((a, b) => a.seq - b.seq);
  return { repo, trip, first, second, store };
}

describe('mock stop progress mirrors sms-api rules', () => {
  it('starts with no progress', async () => {
    const { repo, trip, store } = await started();
    const s = await repo.stops(trip.id);
    expect(s.currentStopId).toBeNull();
    expect(s.stops).toHaveLength(store.route.stops.length);
    expect(s.stops.every((x) => !x.departedAt)).toBe(true);
  });

  it('enforces sequence and current-stop rules', async () => {
    const { repo, trip, first, second } = await started();
    await expect(repo.confirmArrival(trip.id, second.id)).rejects.toMatchObject({ code: 'wrong_stop_order' });
    await repo.confirmArrival(trip.id, first.id);
    await expect(repo.confirmArrival(trip.id, first.id)).rejects.toMatchObject({ code: 'already_at_stop' });
    await expect(repo.departStop(trip.id, second.id)).rejects.toMatchObject({ code: 'not_current_stop' });
    await repo.departStop(trip.id, first.id);
    const s = await repo.stops(trip.id);
    expect(s.currentStopId).toBeNull();
    expect(s.stops.find((x) => x.stopId === first.id)?.departedAt).toBeDefined();
  });

  it('school-arrived is pickup-only and sets the trip to arrived', async () => {
    const { repo, trip } = await started();
    await repo.markSchoolArrived(trip.id);
    expect((await repo.stops(trip.id)).schoolArrivedAt).not.toBeNull();
    expect((await repo.current())?.status).toBe('arrived');
    await expect(repo.markSchoolArrived(trip.id)).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('startTrip returns the existing trip while it is arrived', async () => {
    const { repo, trip } = await started();
    await repo.markSchoolArrived(trip.id);
    const again = await repo.startTrip(trip.routeId, 'pickup', trip.busNo);
    expect(again.id).toBe(trip.id);
    expect(again.status).toBe('arrived');
  });
});
