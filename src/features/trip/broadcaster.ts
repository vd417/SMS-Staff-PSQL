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
let lastPing: TripPing | null = null;
let foregroundWatcher: { remove: () => void } | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let readingFix = false;

try {
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
      accuracy: loc.coords.accuracy ?? undefined,
    };
    lastPing = ping;
    try { await publish(ping); } catch { /* offline — buffer retries on next event */ }
  }
});
} catch {
  // Web and some dev runtimes have no native task manager. A throw here crashes app open.
}

export interface BroadcastDeps {
  tripId: string;
  onPings: (tripId: string, pings: TripPing[]) => Promise<void>;
}

// A 4xx other than 401/429 (trip_ended, not your trip, validation) will never succeed on
// retry — drop that trip's pings so they can't wedge the queue ahead of the new trip's.
const isPermanent = (err: unknown) =>
  isAppError(err) && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429;

// The server confirms a trip is over by rejecting its pings with a trip_ended code (409):
// the trip was ended here moments ago, or ended from another device.
const isTripEnded = (err: unknown) =>
  isAppError(err) && (err.code === 'trip_ended' || err.status === 409);

function sendGrouped(onPings: BroadcastDeps['onPings']) {
  return async (pings: TripPing[]) => {
    const byTrip = new Map<string, TripPing[]>();
    for (const p of pings) byTrip.set(p.tripId, [...(byTrip.get(p.tripId) ?? []), p]);
    for (const [tripId, group] of byTrip) {
      try {
        await onPings(tripId, group);
      } catch (err) {
        // If it's the *active* trip that the server says has ended, stop GPS on this device
        // immediately (and clear persisted state so it can't auto-resume) — otherwise the
        // foreground location service keeps draining the battery for a trip that's over.
        // A stale queued group from an *older* trip just gets dropped, leaving the current
        // trip broadcasting.
        if (isTripEnded(err)) {
          if (tripId === activeTripId) void stopBroadcast();
          continue;
        }
        if (!isPermanent(err)) throw err;
      }
    }
  };
}

export const isBroadcasting = (): boolean => activeTripId !== null;
export const getPersistedBroadcastTripId = (): Promise<string | null> => asyncStore.get<string>(BROADCAST_TRIP_KEY);

// The school marks the bus offline when no ping is younger than 30s. A stopped van
// (waiting at a pickup or drop stop) often gets no watcher callback at all, so keep
// reading — or resend the last fix — on the same cadence until the trip ends.
async function publishCurrentFix(): Promise<void> {
  if (readingFix || !activeTripId || !publish) return;
  const tripAtStart = activeTripId;
  readingFix = true;
  try {
    if (typeof Location.getCurrentPositionAsync !== 'function') {
      republishLast(tripAtStart);
      return;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (activeTripId !== tripAtStart) return;
      // A cached fix can carry an old timestamp. The school treats a ping older
      // than 30s as offline, so stamp a quiet van with the time we read it.
      const age = Date.now() - (loc.timestamp || 0);
      const stamp = !loc.timestamp || age >= CADENCE_MS ? Date.now() : loc.timestamp;
      const sent = publishFromLocation({ ...loc, timestamp: stamp });
      if (!sent && (!last || Date.now() - last.at >= CADENCE_MS)) republishLast(tripAtStart);
    } catch {
      // A failed read must not take a live trip offline. Resend the last fix.
      if (activeTripId !== tripAtStart) return;
      republishLast(tripAtStart);
    }
  } finally {
    readingFix = false;
  }
}

function republishLast(tripId: string): void {
  if (!lastPing || activeTripId !== tripId || !publish) return;
  const at = Date.now();
  const ping: TripPing = { ...lastPing, tripId, at: new Date(at).toISOString() };
  last = { lat: ping.lat, lng: ping.lng, at };
  lastPing = ping;
  publish(ping).catch(() => { /* offline — buffer retries on next event */ });
}

function startHeartbeat(): void {
  if (heartbeat) return;
  heartbeat = setInterval(() => { void publishCurrentFix(); }, CADENCE_MS);
}

function stopHeartbeat(): void {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  readingFix = false;
}

function publishFromLocation(loc: Location.LocationObject): boolean {
  if (!activeTripId || !publish) return false;
  const sample: Sample = { lat: loc.coords.latitude, lng: loc.coords.longitude, at: loc.timestamp };
  if (!shouldPublish(last, sample, CADENCE_MS, MIN_METERS)) return false;
  last = sample;
  const ping: TripPing = {
    tripId: activeTripId,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    speedKmh: Math.max(0, Math.round((loc.coords.speed ?? 0) * 3.6)),
    heading: loc.coords.heading ?? 0,
    at: new Date(loc.timestamp).toISOString(),
    accuracy: loc.coords.accuracy ?? undefined,
  };
  lastPing = ping;
  publish(ping).catch(() => { /* offline — buffer retries on next event */ });
  return true;
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
    lastPing = null;
    const buffer = await createPersistedPingBuffer(sendGrouped(onPings), PING_QUEUE_KEY);
    // Flush anything left over from a prior run that was killed before it could send.
    await buffer.flush();
    publish = (ping) => buffer.enqueue(ping).then(() => buffer.flush());
    await asyncStore.set(BROADCAST_TRIP_KEY, tripId);
    void publishCurrentFix();
    startHeartbeat();

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status === 'granted') {
      try {
        await Location.startLocationUpdatesAsync(TRIP_LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: CADENCE_MS,
          // 0 so a van waiting at a stop still shares on the time cadence. shouldPublish
          // drops anything closer than MIN_METERS inside that window.
          distanceInterval: 0,
          // Tell iOS this is vehicle tracking so it can power-manage the GPS intelligently.
          // Accuracy stays High and updates keep flowing while stationary (no auto-pause),
          // so the school's live view is unchanged — this is a battery hint only (iOS-only;
          // ignored on Android).
          activityType: Location.ActivityType.AutomotiveNavigation,
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
      { accuracy: Location.Accuracy.High, timeInterval: CADENCE_MS, distanceInterval: 0 },
      publishFromLocation
    );
    return true;
  } catch {
    stopHeartbeat();
    activeTripId = null;
    publish = null;
    last = null;
    lastPing = null;
    await asyncStore.remove(BROADCAST_TRIP_KEY).catch(() => {});
    return false;
  }
}

export async function stopBroadcast(): Promise<void> {
  stopHeartbeat();
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
    lastPing = null;
    foregroundWatcher = null;
    await asyncStore.remove(BROADCAST_TRIP_KEY).catch(() => {});
  }
}
