jest.mock('@react-native-async-storage/async-storage', () => {
  let mem: Record<string, string> = {};
  return { __esModule: true, default: {
    getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
    removeItem: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
    clear: jest.fn(() => { mem = {}; return Promise.resolve(); }),
  } };
});

import { startBroadcast, stopBroadcast, isBroadcasting, getPersistedBroadcastTripId } from '../broadcaster';
import { AppError } from '@/lib/errors';

type LocationCallback = (loc: unknown) => void;

const mockRemove = jest.fn();
const mockWatchPositionAsync = jest.fn(async (_opts: unknown, _cb: LocationCallback) => ({ remove: mockRemove }));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  startLocationUpdatesAsync: jest.fn(async () => {
    throw new Error('startLocationUpdatesAsync is not a function');
  }),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  stopLocationUpdatesAsync: jest.fn(async () => {}),
  watchPositionAsync: (...args: unknown[]) => mockWatchPositionAsync(args[0], args[1] as never),
  Accuracy: { High: 6 },
}));

beforeEach(async () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  await AsyncStorage.clear();
  mockRemove.mockClear();
  mockWatchPositionAsync.mockClear();
});

describe('startBroadcast', () => {
  it('falls back to a foreground location watcher when background tasks are unsupported (e.g. web), instead of failing outright', async () => {
    const onPings = jest.fn(async () => {});
    await expect(startBroadcast({ tripId: 't1', onPings })).resolves.toBe(true);
    expect(mockWatchPositionAsync).toHaveBeenCalled();
    await stopBroadcast();
  });

  it('publishes a ping when the foreground watcher reports a new position', async () => {
    const onPings = jest.fn(async () => {});
    await startBroadcast({ tripId: 't1', onPings });
    const watcherCallback = mockWatchPositionAsync.mock.calls[0][1] as (loc: unknown) => void;
    watcherCallback({
      coords: { latitude: 12.9, longitude: 77.6, speed: 5, heading: 90 },
      timestamp: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(onPings).toHaveBeenCalledWith('t1', [expect.objectContaining({ tripId: 't1', lat: 12.9, lng: 77.6 })]);
    await stopBroadcast();
  });

  it('resolves to false when even foreground permission is denied', async () => {
    const Location = jest.requireMock('expo-location');
    Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    await expect(startBroadcast({ tripId: 't1', onPings: jest.fn(async () => {}) })).resolves.toBe(false);
  });

  it('persists the broadcasting trip id and clears it on stop', async () => {
    await startBroadcast({ tripId: 't1', onPings: jest.fn().mockResolvedValue(undefined) });
    expect(isBroadcasting()).toBe(true);
    await expect(getPersistedBroadcastTripId()).resolves.toBe('t1');
    await stopBroadcast();
    expect(isBroadcasting()).toBe(false);
    await expect(getPersistedBroadcastTripId()).resolves.toBeNull();
  });

  it('drops a batch the server permanently rejects so it cannot block newer pings', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem('sms.trip.pingQueue', JSON.stringify([
      { tripId: 'old', lat: 1, lng: 1, speedKmh: 0, heading: 0, at: 'x' },
    ]));
    const onPings = jest.fn()
      .mockRejectedValueOnce(new AppError('trip_ended', 409, 'ended'))
      .mockResolvedValue(undefined);
    await startBroadcast({ tripId: 't2', onPings });
    expect(onPings).toHaveBeenCalledWith('old', expect.any(Array));
    expect(JSON.parse(await AsyncStorage.getItem('sms.trip.pingQueue'))).toEqual([]);
    await stopBroadcast();
  });

  it.each([
    ['a network failure (status 0)', new AppError('network', 0, 'offline')],
    ['a 5xx server error', new AppError('server_error', 500, 'boom')],
    ['a 401 (token expired, may succeed after refresh)', new AppError('unauthorized', 401, 'x')],
    ['a 429 (rate limited, retry later)', new AppError('rate_limited', 429, 'x')],
  ])('keeps the batch queued on %s', async (_label, error) => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem('sms.trip.pingQueue', JSON.stringify([
      { tripId: 't1', lat: 1, lng: 1, speedKmh: 0, heading: 0, at: 'x' },
    ]));
    const onPings = jest.fn().mockRejectedValue(error);
    await startBroadcast({ tripId: 't1', onPings });
    expect(onPings).toHaveBeenCalledWith('t1', expect.any(Array));
    expect(JSON.parse(await AsyncStorage.getItem('sms.trip.pingQueue'))).toEqual([
      { tripId: 't1', lat: 1, lng: 1, speedKmh: 0, heading: 0, at: 'x' },
    ]);
    await stopBroadcast();
  });

  it('single-flights concurrent startBroadcast calls so a second resume effect cannot leak a watcher', async () => {
    const onPings = jest.fn(async () => {});
    const [ok1, ok2] = await Promise.all([
      startBroadcast({ tripId: 't1', onPings }),
      startBroadcast({ tripId: 't1', onPings }),
    ]);
    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    // Only one location watcher was ever created, not two.
    expect(mockWatchPositionAsync).toHaveBeenCalledTimes(1);
    await stopBroadcast();
  });
});

describe('stopBroadcast', () => {
  it('removes the foreground watcher subscription when broadcasting via the fallback', async () => {
    await startBroadcast({ tripId: 't1', onPings: jest.fn(async () => {}) });
    await stopBroadcast();
    expect(mockRemove).toHaveBeenCalled();
  });
});
