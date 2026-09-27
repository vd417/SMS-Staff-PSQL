import { useEffect } from 'react';
import type { Trip } from '@/data/domain';
import { useRepositories } from '@/data/repositories/RepositoryContext';
import { startBroadcast, isBroadcasting, getPersistedBroadcastTripId } from './broadcaster';

/**
 * After the app process restarts mid-trip, the module-level broadcaster is empty and the
 * server stops receiving GPS — every Arrived tap would then fail with no_location/too_far.
 * Resume only on the phone that started this trip (its id was persisted at start).
 */
export function useResumeBroadcast(trip: Trip | null | undefined): void {
  const repos = useRepositories();
  const tripId = trip && (trip.status === 'live' || trip.status === 'arrived') ? trip.id : null;
  useEffect(() => {
    if (!tripId || isBroadcasting()) return;
    let cancelled = false;
    void (async () => {
      const persisted = await getPersistedBroadcastTripId();
      if (cancelled || persisted !== tripId || isBroadcasting()) return;
      await startBroadcast({ tripId, onPings: (id, pings) => repos.trip.publishPings(id, pings) });
    })();
    return () => { cancelled = true; };
  }, [tripId, repos]);
}
