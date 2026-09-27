import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';
import { useStopActions } from '../hooks';
import { AppError } from '@/lib/errors';
import type { Repositories } from '@/data/repositories/types';

jest.mock('@/features/auth/AuthProvider', () => ({ useTenantId: () => 't' }));

function setup(trip: Partial<Repositories['trip']>) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const repos = { trip } as unknown as Repositories;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}><RepositoryProvider repositories={repos}>{children}</RepositoryProvider></QueryClientProvider>
  );
  return renderHook(() => useStopActions('t1'), { wrapper });
}

describe('useStopActions', () => {
  it('resolves when the other phone already confirmed this stop', async () => {
    const { result } = setup({ confirmArrival: jest.fn().mockRejectedValue(new AppError('already_at_stop', 409, 'x')) });
    await act(() => result.current.mutateAsync({ kind: 'arrive', stopId: 's1' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('resolves a repeated depart when the stop is already departed', async () => {
    const { result } = setup({
      departStop: jest.fn().mockRejectedValue(new AppError('not_current_stop', 409, 'x')),
      stops: jest.fn().mockResolvedValue({ tripId: 't1', currentStopId: null, schoolArrivedAt: null, stops: [{ stopId: 's1', name: 'A', seq: 1, departedAt: 'x' }] }),
    });
    await act(() => result.current.mutateAsync({ kind: 'depart', stopId: 's1' }));
  });

  it('surfaces too_far', async () => {
    const { result } = setup({ confirmArrival: jest.fn().mockRejectedValue(new AppError('too_far', 409, 'x')) });
    await expect(act(() => result.current.mutateAsync({ kind: 'arrive', stopId: 's1' }))).rejects.toMatchObject({ code: 'too_far' });
  });
});
