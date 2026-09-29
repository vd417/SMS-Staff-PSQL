import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';
import { createMockRepositories } from '@/data/repositories/factory';
import { createStore } from '@/data/mock/store';
import { useResumeBroadcast } from '@/features/trip/useResumeBroadcast';
import type { Trip } from '@/data/domain';

jest.mock('@react-native-async-storage/async-storage', () => {
  let mem: Record<string, string> = {};
  return { __esModule: true, default: {
    getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
    removeItem: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
    clear: jest.fn(() => { mem = {}; return Promise.resolve(); }),
  } };
});

const mockStartBroadcast = jest.fn();
const mockIsBroadcasting = jest.fn(() => false);
const mockGetPersisted = jest.fn(async () => 't1' as string | null);
jest.mock('@/features/trip/broadcaster', () => ({
  startBroadcast: (...args: unknown[]) => mockStartBroadcast(...args),
  isBroadcasting: () => mockIsBroadcasting(),
  getPersistedBroadcastTripId: () => mockGetPersisted(),
}));

const liveTrip = { id: 't1', status: 'live' } as unknown as Trip;

async function wrapper() {
  const repos = createMockRepositories(await createStore());
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <RepositoryProvider repositories={repos}>{children}</RepositoryProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockStartBroadcast.mockReset();
  mockIsBroadcasting.mockReset();
  mockIsBroadcasting.mockReturnValue(false);
  mockGetPersisted.mockReset();
  mockGetPersisted.mockResolvedValue('t1');
});

it('notifies onResumeFailed when a resume does not start (e.g. permission denied)', async () => {
  mockStartBroadcast.mockResolvedValue(false);
  const onResumeFailed = jest.fn();
  const Wrapper = await wrapper();
  renderHook(() => useResumeBroadcast(liveTrip, onResumeFailed), { wrapper: Wrapper });
  await waitFor(() => expect(onResumeFailed).toHaveBeenCalledTimes(1));
});

it('does not notify onResumeFailed when the resume starts successfully', async () => {
  mockStartBroadcast.mockResolvedValue(true);
  const onResumeFailed = jest.fn();
  const Wrapper = await wrapper();
  renderHook(() => useResumeBroadcast(liveTrip, onResumeFailed), { wrapper: Wrapper });
  await waitFor(() => expect(mockStartBroadcast).toHaveBeenCalled());
  expect(onResumeFailed).not.toHaveBeenCalled();
});

it('notifies onResumeFailed when starting the broadcast throws', async () => {
  mockStartBroadcast.mockRejectedValue(new Error('boom'));
  const onResumeFailed = jest.fn();
  const Wrapper = await wrapper();
  renderHook(() => useResumeBroadcast(liveTrip, onResumeFailed), { wrapper: Wrapper });
  await waitFor(() => expect(onResumeFailed).toHaveBeenCalledTimes(1));
});
