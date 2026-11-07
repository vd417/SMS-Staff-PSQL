import type { HttpClient } from '@/lib/httpClient';
import type { RouteGeometry } from '@/data/domain';
import { parseWire } from './schemas/wire';
import { decodePolyline } from '@/lib/decodePolyline';
import { driveLegSchema, routeGeometrySchema } from './schemas/features.schema';
import type { z } from 'zod';

type RouteGeometryWireDTO = z.output<typeof routeGeometrySchema>;

const toRouteGeometry = (d: RouteGeometryWireDTO): RouteGeometry => ({
  routeId: d.route_id,
  status: d.status,
  format: d.format,
  geometry: d.geometry,
  distanceMeters: d.distance_meters,
  durationSeconds: d.duration_seconds,
  stopSequenceHash: d.stop_sequence_hash,
  generatedAt: d.generated_at,
});

export function httpRouteGeometry(http: HttpClient) {
  return {
    get: (routeId: string): Promise<RouteGeometry> =>
      http.get(`/transport/routes/${routeId}/geometry`).then((d) => toRouteGeometry(parseWire(routeGeometrySchema, d, 'route geometry'))),
    drive: (origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }) =>
      http.post('/transport/routes/drive', {
        origin_lat: origin.latitude,
        origin_lng: origin.longitude,
        destination_lat: destination.latitude,
        destination_lng: destination.longitude,
      }).then((d) => {
        const leg = parseWire(driveLegSchema, d, 'drive leg');
        const line = leg.geometry ? decodePolyline(leg.geometry) : [];
        return line.length > 1 ? line : [];
      }),
  };
}
