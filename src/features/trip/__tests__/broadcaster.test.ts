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
  getCurrentPositionAsync: jest.fn(async () => {
    throw new Error('no fix');
  }),
  Accuracy: { High: 6 },
  ActivityType: { Other: 1, AutomotiveNavigation: 2 },
}));

beforeEach(async () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  const Location = jest.requireMock('expo-location');
  await AsyncStorage.clear();
  mockRemove.mockClear();
  mockWatchPositionAsync.mockClear();
  Location.getCurrentPositionAsync.mockReset();
  Location.getCurrentPositionAsync.mockImplementation(async () => {
    throw new Error('no fix');
  });
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

  it('tags the background location service as automotive navigation so the OS can power-manage it', async () => {
    const Location = jest.requireMock('expo-location');
    // Background updates are supported this run, so the service (not the fg fallback) is used.
    Location.startLocationUpdatesAsync.mockResolvedValueOnce(undefined);
    await startBroadcast({ tripId: 't1', onPings: jest.fn(async () => {}) });
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ activityType: Location.ActivityType.AutomotiveNavigation }),
    );
    await stopBroadcast();
  });

  it('keeps publishing a stopped van on pickup or drop until the trip ends', async () => {
    const Location = jest.requireMock('expo-location');
    let now = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    Location.getCurrentPositionAsync.mockImplementation(async () => ({
      coords: { latitude: 12.9, longitude: 77.6, speed: 0, heading: 90, accuracy: 5 },
      timestamp: now,
    }));
    const ticks: Array<() => void> = [];
    const intervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((fn: any) => {
      ticks.push(fn);
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    const flush = async () => {
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    };
    try {
      const onPings = jest.fn(async () => {});
      await startBroadcast({ tripId: 't1', onPings });
      await flush();
      expect(onPings).toHaveBeenCalledWith('t1', [expect.objectContaining({ lat: 12.9, lng: 77.6, speedKmh: 0 })]);
      const afterStart = onPings.mock.calls.length;

      now += 15_000;
      ticks[0]?.();
      await flush();
      expect(onPings.mock.calls.length).toBeGreaterThan(afterStart);

      Location.getCurrentPositionAsync.mockImplementationOnce(async () => {
        throw new Error('gps unavailable');
      });
      now += 15_000;
      const beforeMiss = onPings.mock.calls.length;
      ticks[0]?.();
      await flush();
      expect(onPings.mock.calls.length).toBeGreaterThan(beforeMiss);

      await stopBroadcast();
      const stopped = onPings.mock.calls.length;
      now += 15_000;
      ticks[0]?.();
      await flush();
      expect(onPings.mock.calls.length).toBe(stopped);
      expect(isBroadcasting()).toBe(false);
    } finally {
      nowSpy.mockRestore();
      intervalSpy.mockRestore();
      Location.getCurrentPositionAsync.mockReset();
      Location.getCurrentPositionAsync.mockImplementation(async () => {
        throw new Error('no fix');
      });
      await stopBroadcast();
    }
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

describe('trip ended server-side', () => {
  async function until(cond: () => boolean, ms = 2000): Promise<void> {
    const start = Date.now();
    while (!cond()) {
      if (Date.now() - start > ms) throw new Error('condition not met in time');
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  const sample = (lat: number, lng: number, at: number) => ({
    coords: { latitude: lat, longitude: lng, speed: 5, heading: 90 },
    timestamp: at,
  });

  it('stops GPS when a ping for the active trip is rejected with trip_ended', async () => {
    const onPings = jest.fn().mockRejectedValue(new AppError('trip_ended', 409, 'ended'));
    await startBroadcast({ tripId: 't1', onPings });
    expect(isBroadcasting()).toBe(true);
    const cb = mockWatchPositionAsync.mock.calls[0][1] as (loc: unknown) => void;
    cb(sample(12.9, 77.6, Date.now()));
    await until(() => !isBroadcasting());
    expect(mockRemove).toHaveBeenCalled();
    await expect(getPersistedBroadcastTripId()).resolves.toBeNull();
  });

  it('sends no further pings after the active trip ends server-side', async () => {
    const onPings = jest.fn().mockRejectedValue(new AppError('trip_ended', 409, 'ended'));
    await startBroadcast({ tripId: 't1', onPings });
    const cb = mockWatchPositionAsync.mock.calls[0][1] as (loc: unknown) => void;
    cb(sample(12.9, 77.6, Date.now()));
    await until(() => !isBroadcasting());
    const callsAtStop = onPings.mock.calls.length;
    cb(sample(12.95, 77.65, Date.now() + 30_000));
    await new Promise((r) => setTimeout(r, 30));
    expect(onPings.mock.calls.length).toBe(callsAtStop);
  });

  it('keeps the current trip broadcasting when an older queued trip is rejected with trip_ended', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem('sms.trip.pingQueue', JSON.stringify([
      { tripId: 'old', lat: 1, lng: 1, speedKmh: 0, heading: 0, at: 'x' },
    ]));
    const onPings = jest.fn()
      .mockRejectedValueOnce(new AppError('trip_ended', 409, 'ended'))
      .mockResolvedValue(undefined);
    await startBroadcast({ tripId: 't2', onPings });
    expect(onPings).toHaveBeenCalledWith('old', expect.any(Array));
    // The *old* trip ended, not t2 — t2 must stay live.
    expect(isBroadcasting()).toBe(true);
    await expect(getPersistedBroadcastTripId()).resolves.toBe('t2');
    await stopBroadcast();
  });
});
