// src/__tests__/integration.test.tsx
// Integration smoke test: boot → Splash → Login → sign-in → Home with school identity.
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { AppProviders } from '@/providers/AppProviders';
import { RootNavigator } from '@/navigation/RootNavigator';

// Mirror the secure-store mock from AuthProvider.test.tsx. `mem` is module-scoped
// so it survives across tests in this file — each test gets its own render() but
// they'd otherwise share one logged-in session. `__reset` lets us clear it in
// beforeEach so every test starts from a clean, unauthenticated boot.
jest.mock('expo-secure-store', () => {
  let mem: Record<string, string> = {};
  return {
    setItemAsync: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
    getItemAsync: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
    deleteItemAsync: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
    __reset: () => { mem = {}; },
  };
});

beforeEach(async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const secureStore = require('expo-secure-store') as { __reset: () => void };
  secureStore.__reset();

  // establishSession() also writes the session to AsyncStorage (src/lib/asyncStore.ts).
  // The global AsyncStorage mock in jest.setup.js is module-scoped like the
  // secure-store mock above, so it leaks across tests in this file too — clear it
  // here for the same reason.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const asyncStorage = require('@react-native-async-storage/async-storage')
    .default as { clear: () => Promise<void> };
  await asyncStorage.clear();
});

// expo-location is imported transitively through AttendanceScreen; mock it so it
// never tries to access native modules in the test environment.
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  requestBackgroundPermissionsAsync: async () => ({ status: 'granted' }),
  getCurrentPositionAsync: async () => ({
    coords: { latitude: 0, longitude: 0, accuracy: 8 },
  }),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(() => Promise.resolve(false)),
  Accuracy: { High: 6 },
}));

// expo-task-manager is imported transitively through TripScreen → broadcaster;
// defineTask runs at module load time so we mock the whole module.
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));

// Reanimated mock — Splash uses reanimated; the mock keeps it inert in tests.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

function renderApp() {
  return render(
    <AppProviders>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AppProviders>,
  );
}

async function pastSplash(getByTestId: ReturnType<typeof render>['getByTestId']) {
  // Two waitFor calls are deliberate, not a copy-paste accident: the first
  // waits for the splash screen to mount, and the second flushes the
  // auth-bootstrap promise through React's update queue (no fixed-time sleep)
  // before we interact with it.
  await waitFor(() => getByTestId('splash'), { timeout: 5000 });
  await waitFor(() => getByTestId('splash'), { timeout: 3000 });
  fireEvent.press(getByTestId('splash'));
}

it('logs in with identifier + password and lands on Home with school identity', async () => {
  const { getByTestId, findByText } = renderApp();
  await pastSplash(getByTestId);

  // Login screen defaults to password mode; phone field is pre-filled valid.
  await waitFor(() => getByTestId('password-input'), { timeout: 5000 });
  fireEvent.changeText(getByTestId('password-input'), 'hunter2222');
  await waitFor(() => expect(getByTestId('login-cta').props.accessibilityState?.disabled).toBe(false));
  fireEvent.press(getByTestId('login-cta'));

  expect(await findByText('Greenfield Public School', {}, { timeout: 5000 })).toBeTruthy();
}, 20000);

it('first-time staff: enter OTP + new password on one screen -> lands on the authenticated app', async () => {
  const { getByTestId, findByText } = renderApp();
  await pastSplash(getByTestId);

  await waitFor(() => getByTestId('first-time-link'), { timeout: 5000 });
  fireEvent.press(getByTestId('first-time-link'));

  // Phone field defaults to '98765 43210' (valid), so send-otp-cta is enabled.
  await waitFor(() => getByTestId('send-otp-cta'), { timeout: 3000 });
  fireEvent.press(getByTestId('send-otp-cta'));

  // OTP entry and password creation now share one screen.
  await waitFor(() => getByTestId('otp-input'), { timeout: 5000 });
  // Mock verifyOtp accepts any 6-digit code.
  fireEvent.changeText(getByTestId('otp-input'), '123456');
  fireEvent.changeText(getByTestId('set-password-new-input'), 'hunter2222');
  fireEvent.changeText(getByTestId('set-password-confirm-input'), 'hunter2222');
  fireEvent.press(getByTestId('activate-cta'));

  expect(await findByText('Greenfield Public School', {}, { timeout: 5000 })).toBeTruthy();
}, 20000);
