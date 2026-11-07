import type { RouteGeometryRepository } from '@/data/repositories/types';
import { simulateLatency } from '@/lib/latency';

export function mockRouteGeometry(): RouteGeometryRepository {
  return {
    async get(routeId) {
      await simulateLatency();
      return {
        routeId,
        status: 'unavailable',
        format: null,
        geometry: null,
        distanceMeters: null,
        durationSeconds: null,
        stopSequenceHash: 'mock',
        generatedAt: null,
      };
    },
    async drive() {
      return [];
    },
  };
}
