import type { MapCoord } from './toMapCoords';

// Squared planar distance. Good enough to pick the nearest vertex on a city-scale path
// (a few km); avoids a sqrt per vertex and never needs true geodesics for a "which point
// is closest" comparison.
function dist2(a: MapCoord, b: MapCoord): number {
  const dlat = a.latitude - b.latitude;
  const dlng = a.longitude - b.longitude;
  return dlat * dlat + dlng * dlng;
}

export interface RouteSplit {
  /** The portion of the road polyline already passed (behind the bus). */
  traveled: MapCoord[];
  /** The portion still ahead of the bus, including the bus's current nearest vertex. */
  ahead: MapCoord[];
}

/**
 * Split a decoded road polyline into the part already traveled and the part still ahead, at the
 * vertex nearest the bus — Uber/Ola's "dim what's behind, highlight what's ahead". The nearest
 * vertex is included in BOTH halves so the two drawn polylines meet with no visible gap. With no
 * bus fix (or a degenerate path) the whole route is treated as "ahead" and nothing is dimmed.
 */
export function splitRouteProgress(path: MapCoord[], bus: MapCoord | null): RouteSplit {
  if (!bus || path.length < 2) return { traveled: [], ahead: path };
  let bestIdx = 0;
  let best = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = dist2(path[i], bus);
    if (d < best) {
      best = d;
      bestIdx = i;
    }
  }
  return { traveled: path.slice(0, bestIdx + 1), ahead: path.slice(bestIdx) };
}
