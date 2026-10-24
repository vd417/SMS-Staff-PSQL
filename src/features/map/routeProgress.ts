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
export interface PathHit {
  point: MapCoord;
  meters: number;
  /** Segment index whose span contains `point`. */
  index: number;
}

/** Closest point on a polyline, in metres from `bus`. */
export function closestOnPath(path: MapCoord[], bus: MapCoord): PathHit | null {
  if (path.length === 0) return null;
  if (path.length === 1) {
    return {
      point: path[0],
      meters: distanceMeters(
        { lat: bus.latitude, lng: bus.longitude },
        { lat: path[0].latitude, lng: path[0].longitude },
      ),
      index: 0,
    };
  }

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

  return { point: bestPoint, meters: best, index: bestIdx };
}

/** Hide the join guide once the van is already on the line. */
export const GUIDE_HIDE_METERS = 30;

/**
 * Straight guide from the van to the nearest point on the route.
 * Empty when there is no fix, no line, or the van is already on the path.
 */
export function guideToPath(path: MapCoord[], bus: MapCoord | null): MapCoord[] {
  if (!bus || path.length < 2) return [];
  const hit = closestOnPath(path, bus);
  if (!hit || hit.meters < GUIDE_HIDE_METERS) return [];
  return [bus, hit.point];
}

function lerp(a: MapCoord, b: MapCoord, t: number): MapCoord {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

/**
 * Break a straight guide into short dashes so the hint stays dotted on web,
 * where the map polyline cannot draw a dash pattern.
 */
export function guideDashes(line: MapCoord[], dashM = 10, gapM = 14, maxDashes = 28): MapCoord[][] {
  if (line.length < 2) return [];
  const a = line[0];
  const b = line[line.length - 1];
  const total = distanceMeters(
    { lat: a.latitude, lng: a.longitude },
    { lat: b.latitude, lng: b.longitude },
  );
  if (total < 8) return [];
  const pair = dashM + gapM;
  let dash = dashM;
  let gap = gapM;
  let count = Math.max(1, Math.floor(total / pair));
  if (count > maxDashes) {
    const scaled = total / maxDashes;
    dash = scaled * (dashM / pair);
    gap = scaled * (gapM / pair);
    count = maxDashes;
  }
  const out: MapCoord[][] = [];
  for (let i = 0; i < count; i++) {
    const startM = i * (dash + gap);
    const endM = Math.min(startM + dash, total);
    if (endM <= startM) break;
    out.push([lerp(a, b, startM / total), lerp(a, b, endM / total)]);
  }
  return out;
}

export function splitRouteProgress(path: MapCoord[], bus: MapCoord | null): RouteSplit {
  if (!bus || path.length < 2) return { traveled: [], ahead: path, offRoute: false };

  const hit = closestOnPath(path, bus);
  if (!hit || hit.meters > ON_ROUTE_METERS) return { traveled: [], ahead: path, offRoute: true };
  const bestIdx = hit.index;
  const bestPoint = hit.point;

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
