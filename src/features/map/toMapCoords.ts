import type { Stop } from '@/data/domain';

export interface MapCoord {
  latitude: number;
  longitude: number;
}

/**
 * True only for real, finite lat/lng. A null/undefined/NaN coordinate handed to a
 * native map Marker crashes the app, so every coordinate is checked at this boundary.
 */
export const isFiniteCoord = (lat: unknown, lng: unknown): boolean =>
  typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng);

export function toMapCoords(stops: Stop[]): MapCoord[] {
  return [...stops]
    .filter((s) => isFiniteCoord(s.lat, s.lng))
    .sort((a, b) => a.seq - b.seq)
    .map((s) => ({ latitude: s.lat, longitude: s.lng }));
}
