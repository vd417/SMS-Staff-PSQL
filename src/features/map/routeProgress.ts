import { distanceMeters } from '@/lib/geo';
import type { MapCoord } from './toMapCoords';

/** Van farther than this from the route line is off-route: draw the route, don't cut progress. */
export const ON_ROUTE_METERS = 80;

const M_PER_DEG_LAT = 110540;

function xy(c: MapCoord, lat0: number): { x: number; y: number } {
  const mPerDegLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return { x: c.longitude * mPerDegLng, y: c.latitude * M_PER_DEG_LAT };
}

function fromXy(x: number, y: number, lat0: number): MapCoord {
  const mPerDegLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return { latitude: y / M_PER_DEG_LAT, longitude: x / mPerDegLng };
}

export interface RouteSplit {
  /** The portion of the road polyline already passed (behind the bus). Empty when off the route. */
  traveled: MapCoord[];
  /** The highlighted remainder. The whole route when the bus is off it or there is no fix. */
  ahead: MapCoord[];
  /** True when the bus is too far from the line to treat as progress along the route. */
  offRoute: boolean;
}

/**
 * Split a route line into the part already traveled and the part still ahead, at the closest
 * point on the line. That point is included in both halves so the highlight meets with no gap.
 * Off the route, the whole line stays ahead so the map draws one route line and does not dim a
 * random stretch. With no fix (or a degenerate path) the whole route is ahead.
 */
export function splitRouteProgress(path: MapCoord[], bus: MapCoord | null): RouteSplit {
  if (!bus || path.length < 2) return { traveled: [], ahead: path, offRoute: false };

  const lat0 = bus.latitude;
  const p = xy(bus, lat0);
  let best = Infinity;
  let bestIdx = 0;
  let bestPoint = path[0];

  for (let i = 0; i < path.length - 1; i++) {
    const a = xy(path[i], lat0);
    const b = xy(path[i + 1], lat0);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    let t = 0;
    if (len2 > 0) {
      t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    const x = a.x + abx * t;
    const y = a.y + aby * t;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < best) {
      best = d;
      bestIdx = i;
      bestPoint = fromXy(x, y, lat0);
    }
  }

  if (best > ON_ROUTE_METERS) return { traveled: [], ahead: path, offRoute: true };

  const segStart = path[bestIdx];
  const segEnd = path[bestIdx + 1];
  const nearStart = distanceMeters(
    { lat: bestPoint.latitude, lng: bestPoint.longitude },
    { lat: segStart.latitude, lng: segStart.longitude },
  ) < 15;
  const nearEnd = distanceMeters(
    { lat: bestPoint.latitude, lng: bestPoint.longitude },
    { lat: segEnd.latitude, lng: segEnd.longitude },
  ) < 15;

  if (nearStart) {
    return { traveled: path.slice(0, bestIdx + 1), ahead: path.slice(bestIdx), offRoute: false };
  }
  if (nearEnd) {
    return { traveled: path.slice(0, bestIdx + 2), ahead: path.slice(bestIdx + 1), offRoute: false };
  }
  return {
    traveled: [...path.slice(0, bestIdx + 1), bestPoint],
    ahead: [bestPoint, ...path.slice(bestIdx + 1)],
    offRoute: false,
  };
}

function polylineMeters(points: MapCoord[]): number {
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    meters += distanceMeters(
      { lat: points[i - 1].latitude, lng: points[i - 1].longitude },
      { lat: points[i].latitude, lng: points[i].longitude },
    );
  }
  return meters;
}

function closestStop(stops: MapCoord[], bus: MapCoord): MapCoord {
  return stops.reduce((best, stop) => (
    distanceMeters(
      { lat: bus.latitude, lng: bus.longitude },
      { lat: stop.latitude, lng: stop.longitude },
    ) < distanceMeters(
      { lat: bus.latitude, lng: bus.longitude },
      { lat: best.latitude, lng: best.longitude },
    )
      ? stop
      : best
  ));
}

/**
 * Highlighted path from the van to the next stop. On the route, follow the line forward to the
 * nearest stop still ahead. Off the route, a straight line to the geographically nearest stop.
 */
export function pathToNearestStop(path: MapCoord[], bus: MapCoord | null, stops: MapCoord[]): MapCoord[] {
  if (!bus || stops.length === 0) return [];
  if (path.length < 2) return [bus, closestStop(stops, bus)];

  const busSplit = splitRouteProgress(path, bus);
  if (busSplit.offRoute) return [bus, closestStop(stops, bus)];

  const busLen = polylineMeters(busSplit.traveled);
  let target: MapCoord | null = null;
  let targetLen = Infinity;
  for (const stop of stops) {
    const split = splitRouteProgress(path, stop);
    if (split.offRoute) continue;
    const len = polylineMeters(split.traveled);
    // Skip stops already passed, and the stop the van is already on, so the line runs to the next one.
    if (len < busLen - 30 || len < busLen + 40) continue;
    if (len < targetLen) {
      targetLen = len;
      target = stop;
    }
  }
  if (!target) return [bus, closestStop(stops, bus)];

  const along = splitRouteProgress(busSplit.ahead, target);
  if (!along.offRoute && along.traveled.length > 1) return along.traveled;
  return [bus, target];
}
