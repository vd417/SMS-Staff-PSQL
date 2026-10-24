import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from '@/theme';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';
import { createMockRepositories } from '@/data/repositories/factory';
import { createStore } from '@/data/mock/store';
import { ToastProvider } from '@/components/ui/Toast';
import { ProfileScreen } from '@/screens/ProfileScreen';

jest.mock('@react-native-async-storage/async-storage', () => {
  let mem: Record<string, string> = {};
  return { __esModule: true, default: {
    getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
    removeItem: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
    clear: jest.fn(() => { mem = {}; return Promise.resolve(); }),
  } };
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

async function renderScreen() {
  const repos = createMockRepositories(await createStore());
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Sign in first so session is populated
  await repos.auth.verifyOtp('98765 43210', '123456', 'driver');
  // Pre-populate auth tokens in secure store so AuthProvider bootstrap finds them
  const SecureStore = require('expo-secure-store');
  await SecureStore.setItemAsync('sms_staff_access_token', 'mock-access-token');
  await SecureStore.setItemAsync('sms_staff_refresh_token', 'mock-refresh-token');
  await AsyncStorage.setItem('sms.session', JSON.stringify({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', user: { id: 'staff_ramesh', name: 'Ramesh Kumar', firstName: 'Ramesh', roleKey: 'driver', empId: 'EMP-2041', joined: '2019-06-12', rating: 4.6, dutyPost: 'Bus / Route', shift: 'Morning Shift', timing: '7:30–3:30', phone: '98765 43210' }, tenant: { id: 'school_greenfield', name: 'Greenfield Public School' } }));
  return render(
    <NavigationContainer>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <QueryClientProvider client={qc}>
          <ThemeProvider>
            <RepositoryProvider repositories={repos}>
              <AuthProvider>
                <ToastProvider>
                  <ProfileScreen />
                </ToastProvider>
              </AuthProvider>
            </RepositoryProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </NavigationContainer>,
  );
}

it('shows a document and the language switcher', async () => {
  const { findByText, getByTestId } = await renderScreen();
  await findByText('Driving licence', {}, { timeout: 4000 });
  fireEvent.press(getByTestId('settings-toggle'));
  expect(getByTestId('lang-hi')).toBeTruthy();
  expect(getByTestId('theme-light')).toBeTruthy();
  expect(getByTestId('toggle-theme')).toBeTruthy();
});

it('shows a My Attendance entry point to view check-in/check-out history', async () => {
  const { findByTestId } = await renderScreen();
  expect(await findByTestId('my-attendance')).toBeTruthy();
});
