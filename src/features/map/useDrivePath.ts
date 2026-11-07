import { useEffect, useRef, useState } from 'react';
import { useRepositories } from '@/data/repositories/RepositoryContext';
import { distanceMeters } from '@/lib/geo';
import type { MapCoord } from './toMapCoords';

/** Don't ask for a new road until the bus or the join point has moved this far. */
const MIN_MOVE_M = 70;

/**
 * Shortest driving path from the bus to the nearest point on the planned route.
 * Null when the bus is on the route, or until a road path comes back.
 */
export function useDrivePath(from: MapCoord | null, to: MapCoord | null): MapCoord[] | null {
  const repos = useRepositories();
  const [path, setPath] = useState<MapCoord[] | null>(null);
  const requested = useRef<{ from: MapCoord; to: MapCoord } | null>(null);

  const fromLat = from?.latitude ?? null;
  const fromLng = from?.longitude ?? null;
  const toLat = to?.latitude ?? null;
  const toLng = to?.longitude ?? null;

  useEffect(() => {
    if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
      requested.current = null;
      setPath(null);
      return;
    }
    const origin = { latitude: fromLat, longitude: fromLng };
    const dest = { latitude: toLat, longitude: toLng };
    const prev = requested.current;
    if (
      prev
      && distanceMeters(
        { lat: prev.from.latitude, lng: prev.from.longitude },
        { lat: origin.latitude, lng: origin.longitude },
      ) < MIN_MOVE_M
      && distanceMeters(
        { lat: prev.to.latitude, lng: prev.to.longitude },
        { lat: dest.latitude, lng: dest.longitude },
      ) < MIN_MOVE_M
    ) {
      return;
    }
    requested.current = { from: origin, to: dest };
    let live = true;
    repos.routeGeometry.drive(origin, dest).then((pts) => {
      if (live && pts.length > 1) setPath(pts);
    }).catch(() => {});
    return () => { live = false; };
  }, [fromLat, fromLng, toLat, toLng, repos]);

  return path;
}
