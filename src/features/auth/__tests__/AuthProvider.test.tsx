import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { ThemeProvider, useTheme } from '@/theme';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';
import { createMockRepositories } from '@/data/repositories/factory';
import { createStore } from '@/data/mock/store';
import { tokenStore } from '@/lib/tokenStore';
import { asyncStore } from '@/lib/asyncStore';
import type { Repositories } from '@/data/repositories/types';
import type { Session } from '@/data/domain';

jest.mock('@react-native-async-storage/async-storage', () => {
  let mem: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
      clear: jest.fn(() => { mem = {}; return Promise.resolve(); }),
    },
  };
});
jest.mock('expo-secure-store', () => {
  let mem: Record<string, string> = {};
  return {
    setItemAsync: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
    getItemAsync: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
    deleteItemAsync: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
  };
});
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

function Harness() {
  const {
    status, session,
    activateWithOtp, signInWithPassword, signOut,
  } = useAuth();
  const { roleKey: themeRole, setRole } = useTheme();
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="school">{session?.tenant.name ?? ''}</Text>
      <Text testID="role">{session?.user.roleKey ?? ''}</Text>
      <Text testID="themeRole">{themeRole}</Text>
      <Pressable testID="preset-driver" onPress={() => setRole('driver')}><Text>preset-driver</Text></Pressable>
      <Pressable testID="activate" onPress={() => activateWithOtp('98765 43210', '123456', 'conductor', 'hunter2222')}><Text>activate</Text></Pressable>
      <Pressable testID="pw-in" onPress={() => signInWithPassword('98765 43210', 'hunter2222', 'peon')}><Text>pw-in</Text></Pressable>
      <Pressable testID="out" onPress={() => signOut()}><Text>out</Text></Pressable>
    </>
  );
}

async function renderWithProviders(repos?: Repositories) {
  const resolvedRepos = repos ?? createMockRepositories(await createStore());
  return render(
    <ThemeProvider>
      <RepositoryProvider repositories={resolvedRepos}>
        <AuthProvider><Harness /></AuthProvider>
      </RepositoryProvider>
    </ThemeProvider>,
  );
}

describe('AuthProvider', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('starts unauthenticated with no stored session', async () => {
    await renderWithProviders();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
  });

  it('signInWithPassword authenticates directly and exposes school + role', async () => {
    await renderWithProviders();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    fireEvent.press(screen.getByTestId('pw-in'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('school')).toHaveTextContent('Greenfield Public School');
    expect(screen.getByTestId('role')).toHaveTextContent('peon');
  });

  it('activateWithOtp verifies the OTP, sets the password, then authenticates in one step', async () => {
    await renderWithProviders();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    fireEvent.press(screen.getByTestId('activate'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('role')).toHaveTextContent('conductor');
  });

  it('fails safe to unauthenticated when token storage throws during bootstrap', async () => {
    const SecureStore = require('expo-secure-store');
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('SecureStore.getValueWithKeyAsync is not a function'),
    );
    await renderWithProviders();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
  });

  it('signOut returns to unauthenticated', async () => {
    await renderWithProviders();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    fireEvent.press(screen.getByTestId('pw-in'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    fireEvent.press(screen.getByTestId('out'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
  });

  it('login applies the session roleKey to the theme, overriding a pre-login role tap', async () => {
    await renderWithProviders();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    // Simulate tapping the "Driver" tile on the login screen before logging in.
    fireEvent.press(screen.getByTestId('preset-driver'));
    await waitFor(() => expect(screen.getByTestId('themeRole')).toHaveTextContent('driver'));
    // pw-in logs in and the backend-authoritative session comes back as 'peon'.
    fireEvent.press(screen.getByTestId('pw-in'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('themeRole')).toHaveTextContent('peon');
  });

  it('session restore applies the stored session roleKey to the theme', async () => {
    const store = await createStore();
    const baseRepos = createMockRepositories(store);
    // Mirror the real /auth/me contract: it has no concept of duty roles, so it
    // preserves whatever roleKey the stored session already carried.
    const repos: Repositories = {
      ...baseRepos,
      auth: { ...baseRepos.auth, me: async (previous) => ({ ...previous! }) },
    };
    const storedSession: Session = { ...store.session, user: { ...store.session.user, roleKey: 'guard' } };
    await tokenStore.save({ accessToken: storedSession.accessToken, refreshToken: storedSession.refreshToken });
    await asyncStore.set('sms.session', storedSession);

    await renderWithProviders(repos);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('themeRole')).toHaveTextContent('guard');
  });

  it('a session with no roleKey leaves the theme role unchanged', async () => {
    const store = await createStore();
    const baseRepos = createMockRepositories(store);
    const repos: Repositories = {
      ...baseRepos,
      auth: {
        ...baseRepos.auth,
        login: async (identifier, password, roleKey) => {
          const s = await baseRepos.auth.login(identifier, password, roleKey);
          return { ...s, user: { ...s.user, roleKey: undefined as unknown as Session['user']['roleKey'] } };
        },
      },
    };
    await renderWithProviders(repos);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByTestId('themeRole')).toHaveTextContent('driver');
    fireEvent.press(screen.getByTestId('pw-in'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    // No roleKey came back from the backend, so the theme's role must not change
    // (and the app must not crash).
    expect(screen.getByTestId('themeRole')).toHaveTextContent('driver');
  });
});
