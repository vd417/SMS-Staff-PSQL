import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/theme';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';
import { createMockRepositories } from '@/data/repositories/factory';
import { createStore } from '@/data/mock/store';
import { TripScreen } from '@/screens/TripScreen';
import { ToastProvider } from '@/components/ui';

jest.mock('@react-native-async-storage/async-storage', () => {
  let mem: Record<string, string> = {};
  return { __esModule: true, default: {
    getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
    removeItem: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
    clear: jest.fn(() => { mem = {}; return Promise.resolve(); }),
  } };
});
jest.mock('@/features/trip/broadcaster', () => ({
  startBroadcast: jest.fn(() => Promise.resolve(true)),
  stopBroadcast: jest.fn(() => Promise.resolve()),
  isBroadcasting: jest.fn(() => false),
  getPersistedBroadcastTripId: jest.fn(() => Promise.resolve(null)),
}));

// The mocked AsyncStorage's backing store persists across tests in this file (the
// jest.mock factory runs once per file) — reset it so each test starts with no active trip.
beforeEach(async () => {
  await AsyncStorage.clear();
});

// Helper that flips the theme role to conductor on mount.
const SetConductor: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setRole } = useTheme();
  React.useEffect(() => { setRole('conductor'); }, [setRole]);
  return <>{children}</>;
};

async function renderConductor(reposOverride?: ReturnType<typeof createMockRepositories>) {
  const repos = reposOverride ?? createMockRepositories(await createStore());
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const nav = { goBack: jest.fn(), navigate: jest.fn() };
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <ToastProvider>
            <SetConductor>
              <RepositoryProvider repositories={repos}>
                <TripScreen navigation={nav as never} />
              </RepositoryProvider>
            </SetConductor>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

it('shows the roster + headcount after starting a trip and boards a student', async () => {
  const { getByTestId, findByText } = await renderConductor();
  await findByText(/Route 7/);
  fireEvent.press(getByTestId('trip-start'));
  await waitFor(() => expect(getByTestId('roster-stu_1')).toBeTruthy(), { timeout: 4000 });
  fireEvent.press(getByTestId('roster-stu_1'));
  await waitFor(() => expect(getByTestId('headcount').props.children).toMatch(/1/), { timeout: 4000 });
});

it('shows the driver name to a conductor when the bus has one assigned', async () => {
  const repos = createMockRepositories(await createStore());
  const originalMyAssignment = repos.trip.myAssignment.bind(repos.trip);
  repos.trip.myAssignment = async () => ({ ...(await originalMyAssignment()), driverName: 'Ramesh' });
  const { findByText } = await renderConductor(repos);
  expect(await findByText('Bus Driver · Ramesh')).toBeTruthy();
});
