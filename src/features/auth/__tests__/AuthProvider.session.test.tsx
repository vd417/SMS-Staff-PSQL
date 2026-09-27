import React from 'react';
import { Text } from 'react-native';
import { render, waitFor, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';
import { ThemeProvider } from '@/theme';
import { sessionEvents } from '@/lib/sessionEvents';
import { AppError } from '@/lib/errors';
import type { Repositories } from '@/data/repositories/types';

const mockTokens = { read: jest.fn(), save: jest.fn(), clear: jest.fn() };
// The mock factory runs at import time (before this file's own top-level `const`s are
// initialised, since ESM hoists imports above them), so it must not capture `mockTokens`
// by value — each method is wrapped so the lookup happens lazily, at call time.
jest.mock('@/lib/tokenStore', () => ({
  tokenStore: {
    read: (...args: unknown[]) => mockTokens.read(...args),
    save: (...args: unknown[]) => mockTokens.save(...args),
    clear: (...args: unknown[]) => mockTokens.clear(...args),
  },
}));
const mockStore: Record<string, unknown> = {};
jest.mock('@/lib/asyncStore', () => ({
  asyncStore: {
    get: jest.fn(async (k: string) => mockStore[k] ?? null),
    set: jest.fn(async (k: string, v: unknown) => { mockStore[k] = v; }),
    remove: jest.fn(async (k: string) => { delete mockStore[k]; }),
  },
}));

const user = { id: 'u1', name: 'Ramesh', firstName: 'Ramesh', roleKey: 'driver', empId: '', joined: '', rating: 0, dutyPost: '', shift: '', timing: '', phone: '' };
const stored = { accessToken: 'at-old', refreshToken: 'rt-old', user, tenant: { id: 't1', name: 'School' } };

function repos(me: jest.Mock): Repositories {
  return { auth: { me, logout: jest.fn().mockResolvedValue(undefined) } } as unknown as Repositories;
}

const Probe = () => { const a = useAuth(); return <Text testID="status">{a.status}</Text>; };
const renderWith = (r: Repositories) =>
  render(<ThemeProvider><RepositoryProvider repositories={r}><AuthProvider><Probe /></AuthProvider></RepositoryProvider></ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockStore['sms.session'] = stored;
  mockTokens.read.mockResolvedValue({ accessToken: 'at-old', refreshToken: 'rt-old' });
});

describe('AuthProvider session lifecycle', () => {
  it('keeps the stored session when /auth/me fails with a network error', async () => {
    const r = renderWith(repos(jest.fn().mockRejectedValue(new AppError('network', 0, 'offline'))));
    await waitFor(() => expect(r.getByTestId('status').props.children).toBe('authenticated'));
    expect(mockTokens.clear).not.toHaveBeenCalled();
  });

  it('logs out when /auth/me is rejected for auth reasons', async () => {
    const r = renderWith(repos(jest.fn().mockRejectedValue(new AppError('unauthorized', 401, 'x'))));
    await waitFor(() => expect(r.getByTestId('status').props.children).toBe('unauthenticated'));
    expect(mockTokens.clear).toHaveBeenCalled();
  });

  it('adopts tokens rotated during bootstrap instead of the ones read before /auth/me', async () => {
    const { authSnapshot } = require('@/lib/authSnapshot');
    mockTokens.read
      .mockResolvedValueOnce({ accessToken: 'at-old', refreshToken: 'rt-old' })
      .mockResolvedValue({ accessToken: 'at-new', refreshToken: 'rt-new' });
    const r = renderWith(repos(jest.fn().mockResolvedValue(user)));
    await waitFor(() => expect(r.getByTestId('status').props.children).toBe('authenticated'));
    expect(authSnapshot.get().accessToken).toBe('at-new');
  });

  it('returns to unauthenticated when the session expires', async () => {
    const r = renderWith(repos(jest.fn().mockResolvedValue(user)));
    await waitFor(() => expect(r.getByTestId('status').props.children).toBe('authenticated'));
    act(() => sessionEvents.emitExpired());
    await waitFor(() => expect(r.getByTestId('status').props.children).toBe('unauthenticated'));
    expect(mockTokens.clear).toHaveBeenCalled();
  });
});
