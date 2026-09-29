import { useEffect, useRef } from 'react';
import type { Trip } from '@/data/domain';
import { useRepositories } from '@/data/repositories/RepositoryContext';
import { startBroadcast, isBroadcasting, getPersistedBroadcastTripId } from './broadcaster';

/**
 * After the app process restarts mid-trip, the module-level broadcaster is empty and the
 * server stops receiving GPS — every Arrived tap would then fail with no_location/too_far.
 * Resume only on the phone that started this trip (its id was persisted at start).
 *
 * If the resume does not start — location permission was revoked while the app was gone, or
 * the platform refused the background stream — `onResumeFailed` is invoked so the caller can
 * tell the driver that live sharing is off (otherwise the failure is silent and they think
 * the bus is still being tracked). Kept in a ref so a fresh inline callback each render never
 * re-triggers the resume effect.
 */
export function useResumeBroadcast(trip: Trip | null | undefined, onResumeFailed?: () => void): void {
  const repos = useRepositories();
  const failedRef = useRef(onResumeFailed);
  failedRef.current = onResumeFailed;
  const tripId = trip && (trip.status === 'live' || trip.status === 'arrived') ? trip.id : null;
  useEffect(() => {
    if (!tripId || isBroadcasting()) return;
    let cancelled = false;
    void (async () => {
      const persisted = await getPersistedBroadcastTripId();
      if (cancelled || persisted !== tripId || isBroadcasting()) return;
      let started = false;
      try {
        started = await startBroadcast({ tripId, onPings: (id, pings) => repos.trip.publishPings(id, pings) });
      } catch {
        started = false;
      }
      if (!cancelled && !started) failedRef.current?.();
    })();
    return () => { cancelled = true; };
  }, [tripId, repos]);
}
