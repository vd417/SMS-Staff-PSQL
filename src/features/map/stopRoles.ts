import type { Stop } from '@/data/domain';
import { distanceMeters } from '@/lib/geo';
import { nearestStop } from './nearestStop';

export type StopRole = 'completed' | 'current' | 'next' | 'upcoming';

/** Stops inside this radius get a light highlight while the van is off the route. */
export const NEAR_STOP_METERS = 400;

export interface StopWithRole {
  stop: Stop;
  role: StopRole;
  isDestination: boolean;
  /** Light highlight: the van is off the route and this stop is close. */
  near: boolean;
}

export function stopRoles(
  stops: Stop[],
  liveMarker: { latitude: number; longitude: number } | null,
  options?: { offRoute?: boolean },
): StopWithRole[] {
  const sorted = [...stops].sort((a, b) => a.seq - b.seq);
  if (sorted.length === 0) return [];

  const offRoute = options?.offRoute ?? false;
  const destinationSeq = sorted[sorted.length - 1].seq;
  const current = nearestStop(stops, liveMarker);
  const currentSeq = current?.seq ?? sorted[0].seq - 1;
  const from = liveMarker ? { lat: liveMarker.latitude, lng: liveMarker.longitude } : null;

  return sorted.map((stop) => {
    let role: StopRole;
    if (stop.seq < currentSeq) role = 'completed';
    else if (stop.seq === currentSeq && current) role = 'current';
    else if (stop.seq === currentSeq + 1) role = 'next';
    else role = 'upcoming';
    const meters = from ? distanceMeters(from, { lat: stop.lat, lng: stop.lng }) : Infinity;
    const near = offRoute && meters <= NEAR_STOP_METERS;
    if (offRoute && role === 'current' && !near) role = 'upcoming';
    return { stop, role, isDestination: stop.seq === destinationSeq, near };
  });
}
