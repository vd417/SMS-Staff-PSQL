import { QueryClient } from '@tanstack/react-query';
import { isAppError } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (isAppError(error) && error.status === 401) return false;
        return failureCount < 2;
      },
    },
  },
});

export const queryKeys = {
  dashboard: (tenantId: string) => ['dashboard', tenantId] as const,
  attendance: (tenantId: string) => ['attendance', tenantId] as const,
  schoolLocation: (tenantId: string) => ['attendance', 'schoolLocation', tenantId] as const,
  session: () => ['session'] as const,
  tripAssignment: (tenantId: string) => ['trip', 'assignment', tenantId] as const,
  tripCurrent: (tenantId: string) => ['trip', 'current', tenantId] as const,
  tripRoster: (tripId: string) => ['trip', 'roster', tripId] as const,
  tripStops: (tripId: string) => ['trip', 'stops', tripId] as const,
  routeGeometry: (routeId: string) => ['transport', 'routeGeometry', routeId] as const,
  tripBoarding: (tripId: string) => ['trip', 'boarding', tripId] as const,
  tasks: (tenantId: string) => ['tasks', tenantId] as const,
  issues: (tenantId: string) => ['issues', tenantId] as const,
  issueDetail: (id: string) => ['issues', 'detail', id] as const,
  leave: (tenantId: string) => ['leave', tenantId] as const,
  profile: (tenantId: string) => ['profile', tenantId] as const,
  vehicleInspections: (busId: string) => ['vehicleChecks', 'inspections', busId] as const,
  fuelLogs: (busId: string) => ['vehicleChecks', 'fuelLogs', busId] as const,
};
