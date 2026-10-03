import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRepositories } from '@/data/repositories/RepositoryContext';
import { useTenantId } from '@/features/auth/AuthProvider';
import { queryKeys } from '@/lib/queryClient';
import type { Task } from '@/data/domain';

export function useTasks() {
  const repos = useRepositories();
  const tenantId = useTenantId();
  return useQuery({ queryKey: queryKeys.tasks(tenantId), queryFn: () => repos.tasks.list() });
}

export function useCompleteTask() {
  const repos = useRepositories();
  const qc = useQueryClient();
  const tenantId = useTenantId();
  const key = queryKeys.tasks(tenantId);
  return useMutation({
    mutationFn: ({ id, remark }: { id: string; remark?: string }) => repos.tasks.complete(id, remark),
    onMutate: async ({ id, remark }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Task[]>(key) ?? [];
      qc.setQueryData<Task[]>(key, prev.map((t) => (t.id === id ? { ...t, done: true, remark: remark ?? t.remark } : t)));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData(key, ctx.prev); },
    // Home's pending-tasks preview is derived from this same task list server-side,
    // so it needs invalidating too or it goes stale after a completion.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard(tenantId) });
    },
  });
}

export function useAttachTaskPhoto() {
  const repos = useRepositories();
  const qc = useQueryClient();
  const tenantId = useTenantId();
  const key = queryKeys.tasks(tenantId);
  return useMutation({
    mutationFn: ({ id, photoUri }: { id: string; photoUri: string }) => repos.tasks.attachPhoto(id, photoUri),
    onMutate: async ({ id, photoUri }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Task[]>(key) ?? [];
      qc.setQueryData<Task[]>(key, prev.map((t) => (t.id === id ? { ...t, photoUrl: photoUri } : t)));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData(key, ctx.prev); },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard(tenantId) });
    },
  });
}
