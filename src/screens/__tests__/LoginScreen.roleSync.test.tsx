import React from 'react';
import { Text } from 'react-native';
import { fireEvent, waitFor, render } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider, useTheme } from '@/theme';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';
import { createMockRepositories } from '@/data/repositories/factory';
import { createStore } from '@/data/mock/store';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ToastProvider } from '@/components/ui';
import { LoginScreen } from '@/screens/LoginScreen';
import type { Repositories } from '@/data/repositories/types';

// Probe that surfaces the live theme roleKey so tests can assert on the
// app's actual session identity, independent of whatever tile was tapped.
function ThemeRoleProbe() {
  const { roleKey } = useTheme();
  return <Text testID="probe-role">{roleKey}</Text>;
}

async function renderLoginWithAuthoritativeRole(backendRoleKey: string) {
  const store = await createStore();
  const baseRepos = createMockRepositories(store);
  // Simulate the backend-authoritative session: whatever role was tapped on
  // the login screen, the real session that comes back is `backendRoleKey`.
  const repos: Repositories = {
    ...baseRepos,
    auth: {
      ...baseRepos.auth,
      login: async (identifier, password, roleKey) => {
        const s = await baseRepos.auth.login(identifier, password, roleKey);
        return { ...s, user: { ...s.user, roleKey: backendRoleKey as never } };
      },
    },
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RepositoryProvider repositories={repos}>
          <AuthProvider>
            <ToastProvider>
              <LoginScreen />
              <ThemeRoleProbe />
            </ToastProvider>
          </AuthProvider>
        </RepositoryProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

it('the session\'s role_key becomes the app\'s role after login, with no role picker on screen', async () => {
  const { getByTestId, queryByTestId } = await renderLoginWithAuthoritativeRole('guard');
  await waitFor(() => getByTestId('identifier-input'));

  // The login screen no longer offers a role choice — identity comes from the
  // backend-authoritative session only.
  expect(queryByTestId('role-driver')).toBeNull();

  fireEvent.changeText(getByTestId('identifier-input'), '98765 43210');
  fireEvent.changeText(getByTestId('password-input'), 'hunter2222');
  await waitFor(() => expect(getByTestId('login-cta').props.accessibilityState?.disabled).toBe(false));
  fireEvent.press(getByTestId('login-cta'));

  await waitFor(() => expect(getByTestId('probe-role')).toHaveTextContent('guard'));
});
