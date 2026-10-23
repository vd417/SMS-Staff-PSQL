import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Attendance, AttendanceLog } from '@/data/domain';
import { useRepositories } from '@/data/repositories/RepositoryContext';
import { useTenantId } from '@/features/auth/AuthProvider';
import { queryKeys } from '@/lib/queryClient';
import { latestPunch, retainPunch, withTodayFlag } from './reconcile';

const emptyAttendance = (dutyPost = ''): Attendance => ({
  checkedIn: false,
  lastLog: [],
  dutyPost,
  geofenceRadiusM: 0,
});

export function useAttendanceStatus() {
  const repos = useRepositories();
  const tenantId = useTenantId();
  const qc = useQueryClient();
  const key = queryKeys.attendance(tenantId);
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const server = await repos.attendance.status();
      return retainPunch(withTodayFlag(server), latestPunch(qc.getQueryData<Attendance>(key)));
    },
  });
}

export function useSchoolLocation() {
  const repos = useRepositories();
  const tenantId = useTenantId();
  return useQuery({
    queryKey: queryKeys.schoolLocation(tenantId),
    queryFn: () => repos.attendance.schoolLocation(),
    staleTime: 5 * 60_000,
  });
}

interface CheckPunch {
  at: string;
  lat: number;
  lng: number;
  accuracyMeters: number;
}

export function useCheckIn() {
  const repos = useRepositories();
  const tenantId = useTenantId();
  const qc = useQueryClient();
  const key = queryKeys.attendance(tenantId);
  return useMutation({
    mutationFn: ({ at, lat, lng, accuracyMeters }: CheckPunch) =>
      repos.attendance.checkIn(at, lat, lng, accuracyMeters),
    onMutate: async ({ at }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Attendance>(key);
      const punch: AttendanceLog = { at, kind: 'in', inZone: true };
      qc.setQueryData<Attendance>(key, retainPunch(prev ?? emptyAttendance(), punch));
      return { prev };
    },
    onSuccess: (server, { at }) => {
      qc.setQueryData(key, retainPunch(withTodayFlag(server), { at, kind: 'in', inZone: true }));
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      else qc.removeQueries({ queryKey: key });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useCheckOut() {
  const repos = useRepositories();
  const tenantId = useTenantId();
  const qc = useQueryClient();
  const key = queryKeys.attendance(tenantId);
  return useMutation({
    mutationFn: ({ at, lat, lng, accuracyMeters }: CheckPunch) =>
      repos.attendance.checkOut(at, lat, lng, accuracyMeters),
    onMutate: async ({ at }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Attendance>(key);
      const punch: AttendanceLog = { at, kind: 'out', inZone: true };
      qc.setQueryData<Attendance>(key, retainPunch(prev ?? emptyAttendance(), punch));
      return { prev };
    },
    onSuccess: (server, { at }) => {
      qc.setQueryData(key, retainPunch(withTodayFlag(server), { at, kind: 'out', inZone: true }));
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      else qc.removeQueries({ queryKey: key });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
