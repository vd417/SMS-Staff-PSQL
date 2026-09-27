import type { DashboardRepository } from '@/data/repositories/types';
import type { HttpClient } from '@/lib/httpClient';
import { deviceUtcOffsetMinutes } from '@/lib/date';
import { toDashboard } from './mappers';
import { parseWire } from './schemas/wire';
import { dashboardSchema } from './schemas/dashboard.schema';

export function httpDashboard(http: HttpClient): DashboardRepository {
  return {
    get: () =>
      http
        .get('/staff/dashboard', { offset_minutes: deviceUtcOffsetMinutes() })
        .then((d) => toDashboard(parseWire(dashboardSchema, d, 'dashboard'))),
  };
}
