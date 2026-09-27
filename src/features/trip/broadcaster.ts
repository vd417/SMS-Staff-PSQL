import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { TripPing } from '@/data/domain';
import { shouldPublish, createPersistedPingBuffer, type Sample } from './pingQueue';
import { asyncStore } from '@/lib/asyncStore';
import { isAppError } from '@/lib/errors';

const PING_QUEUE_KEY = 'sms.trip.pingQueue';
const BROADCAST_TRIP_KEY = 'sms.trip.broadcastingTripId';

export const TRIP_LOCATION_TASK = 'sms-trip-location';
const CADENCE_MS = 10_000;
const MIN_METERS = 50;

// The active publisher is registered at startBroadcast time and read by the task.
let activeTripId: string | null = null;
let publish: ((ping: TripPing) => Promise<void>) | null = null;
let last: Sample | null = null;
let foregroundWatcher: { remove: () => void } | null = null;

TaskManager.defineTask(TRIP_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data || !activeTripId || !publish) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  for (const loc of locations) {
    const sample: Sample = { lat: loc.coords.latitude, lng: loc.coords.longitude, at: loc.timestamp };
    if (!shouldPublish(last, sample, CADENCE_MS, MIN_METERS)) continue;
    last = sample;
    const ping: TripPing = {
      tripId: activeTripId,
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      speedKmh: Math.max(0, Math.round((loc.coords.speed ?? 0) * 3.6)),
      heading: loc.coords.heading ?? 0,
      at: new Date(loc.timestamp).toISOString(),
    };
    try { await publish(ping); } catch { /* offline — buffer retries on next event */ }
  }
});

export interface BroadcastDeps {
  tripId: string;
  onPings: (tripId: string, pings: TripPing[]) => Promise<void>;
}

// A 4xx other than 401/429 (trip_ended, not your trip, validation) will never succeed on
// retry — drop that trip's pings so they can't wedge the queue ahead of the new trip's.
const isPermanent = (err: unknown) =>
  isAppError(err) && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429;

function sendGrouped(onPings: BroadcastDeps['onPings']) {
  return async (pings: TripPing[]) => {
    const byTrip = new Map<string, TripPing[]>();
    for (const p of pings) byTrip.set(p.tripId, [...(byTrip.get(p.tripId) ?? []), p]);
    for (const [tripId, group] of byTrip) {
      try {
        await onPings(tripId, group);
      } catch (err) {
        if (!isPermanent(err)) throw err;
      }
    }
  };
}

export const isBroadcasting = (): boolean => activeTripId !== null;
export const getPersistedBroadcastTripId = (): Promise<string | null> => asyncStore.get<string>(BROADCAST_TRIP_KEY);

function publishFromLocation(loc: Location.LocationObject): void {
  if (!activeTripId || !publish) return;
  const sample: Sample = { lat: loc.coords.latitude, lng: loc.coords.longitude, at: loc.timestamp };
  if (!shouldPublish(last, sample, CADENCE_MS, MIN_METERS)) return;
  last = sample;
  const ping: TripPing = {
    tripId: activeTripId,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    speedKmh: Math.max(0, Math.round((loc.coords.speed ?? 0) * 3.6)),
    heading: loc.coords.heading ?? 0,
    at: new Date(loc.timestamp).toISOString(),
  };
  publish(ping).catch(() => { /* offline — buffer retries on next event */ });
}

// Two resume effects (TripScreen and LiveMapScreen) can both mount right after a restart and
// call startBroadcast concurrently — without this guard each would create its own buffer and
// location watcher, leaking the first watcher. A second call while one is still in progress
// gets the same in-flight promise instead of starting a second one.
let starting: Promise<boolean> | null = null;

export function startBroadcast(deps: BroadcastDeps): Promise<boolean> {
  if (!starting) {
    starting = startBroadcastImpl(deps).finally(() => { starting = null; });
  }
  return starting;
}

// Returns true if broadcasting started (permissions granted), false otherwise.
// Background location tasks aren't supported on every platform (e.g. expo-task-manager
// has no web implementation) — when starting the background stream fails for that reason,
// fall back to a foreground watcher instead of failing outright. The foreground fallback
// only reports positions while the tab/app stays open, which is acceptable for web since
// real drivers use the native app.
async function startBroadcastImpl({ tripId, onPings }: BroadcastDeps): Promise<boolean> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;

    activeTripId = tripId;
    last = null;
    const buffer = await createPersistedPingBuffer(sendGrouped(onPings), PING_QUEUE_KEY);
    // Flush anything left over from a prior run that was killed before it could send.
    await buffer.flush();
    publish = (ping) => buffer.enqueue(ping).then(() => buffer.flush());
    await asyncStore.set(BROADCAST_TRIP_KEY, tripId);

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status === 'granted') {
      try {
        await Location.startLocationUpdatesAsync(TRIP_LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: CADENCE_MS,
          distanceInterval: MIN_METERS,
          foregroundService: {
            notificationTitle: 'Trip live',
            notificationBody: 'Sharing the bus location with the school',
            notificationColor: '#0E5C4A',
          },
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
        });
        return true;
      } catch {
        // Background task registration unsupported on this platform — fall through to foreground.
      }
    }

    foregroundWatcher = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: CADENCE_MS, distanceInterval: MIN_METERS },
      publishFromLocation
    );
    return true;
  } catch {
    activeTripId = null;
    publish = null;
    last = null;
    await asyncStore.remove(BROADCAST_TRIP_KEY).catch(() => {});
    return false;
  }
}

export async function stopBroadcast(): Promise<void> {
  try {
    if (foregroundWatcher) {
      foregroundWatcher.remove();
      foregroundWatcher = null;
      return;
    }
    const running = await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK);
    if (running) await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK);
  } finally {
    activeTripId = null;
    publish = null;
    last = null;
    foregroundWatcher = null;
    await asyncStore.remove(BROADCAST_TRIP_KEY).catch(() => {});
  }
}
