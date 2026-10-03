import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider } from '@/theme';
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
// The screen calls the broadcaster; mock it so no native modules load in jest.
jest.mock('@/features/trip/broadcaster', () => ({
  startBroadcast: jest.fn(() => Promise.resolve(true)),
  stopBroadcast: jest.fn(() => Promise.resolve()),
  isBroadcasting: jest.fn(() => false),
  getPersistedBroadcastTripId: jest.fn(() => Promise.resolve(null as string | null)),
}));
import * as broadcaster from '@/features/trip/broadcaster';
const mockBroadcaster = broadcaster as unknown as {
  startBroadcast: jest.Mock;
  stopBroadcast: jest.Mock;
  isBroadcasting: jest.Mock;
  getPersistedBroadcastTripId: jest.Mock;
};

// The mocked AsyncStorage's backing store persists across tests in this file
// (the jest.mock factory above runs once per file, not per test) since
// createStore() reads/writes through it — reset it so each test starts from
// a clean "no active trip" state regardless of run order.
beforeEach(async () => {
  await AsyncStorage.clear();
  mockBroadcaster.startBroadcast.mockReset().mockResolvedValue(true);
  mockBroadcaster.stopBroadcast.mockReset().mockResolvedValue(undefined);
  mockBroadcaster.isBroadcasting.mockReset().mockReturnValue(false);
  mockBroadcaster.getPersistedBroadcastTripId.mockReset().mockResolvedValue(null);
});

async function renderScreen(reposOverride?: ReturnType<typeof createMockRepositories>) {
  const repos = reposOverride ?? createMockRepositories(await createStore());
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const nav = { goBack: jest.fn(), navigate: jest.fn() };
  const utils = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <ToastProvider>
            <RepositoryProvider repositories={repos}>
              <TripScreen navigation={nav as never} />
            </RepositoryProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, nav, repos };
}

it('shows the assignment then starts a trip on Start', async () => {
  const { getByTestId, findByText } = await renderScreen();
  await findByText(/Route 7/);
  fireEvent.press(getByTestId('trip-start'));
  await waitFor(() => expect(getByTestId('trip-end')).toBeTruthy());
});

it('shows the roster panel to a driver once a trip is started', async () => {
  const { getByTestId, findByText } = await renderScreen();
  await findByText(/Route 7/);
  fireEvent.press(getByTestId('trip-start'));
  await waitFor(() => expect(getByTestId('trip-end')).toBeTruthy());
  expect(getByTestId('headcount')).toBeTruthy();
});

it('shows the trip direction (Pickup by default) on the active screen', async () => {
  const { getByTestId, getByText, findByText } = await renderScreen();
  await findByText(/Route 7/);
  fireEvent.press(getByTestId('trip-start'));
  await waitFor(() => expect(getByTestId('trip-end')).toBeTruthy());
  expect(getByText(/• Pickup/)).toBeTruthy();
});

it('keeps the selected Drop direction on the active screen', async () => {
  const { getByTestId, getByText, findByText } = await renderScreen();
  await findByText(/Route 7/);
  fireEvent.press(getByTestId('trip-dir-drop'));
  fireEvent.press(getByTestId('trip-start'));
  await waitFor(() => expect(getByTestId('trip-end')).toBeTruthy());
  expect(getByText(/• Drop/)).toBeTruthy();
});

it('shows a pickup progress bar that tracks boarded students', async () => {
  const { getByTestId, findByText, repos } = await renderScreen();
  await findByText(/Route 7/);
  fireEvent.press(getByTestId('trip-start'));
  await waitFor(() => expect(getByTestId('trip-end')).toBeTruthy());

  const trip = await repos.trip.current();
  const roster = await repos.trip.roster(trip!.id);
  await waitFor(() =>
    expect(getByTestId('roster-progress').props.accessibilityValue).toEqual({ min: 0, max: roster.length, now: 0 }),
  );

  fireEvent.press(getByTestId(`roster-${roster[0].id}`));
  await waitFor(() =>
    expect(getByTestId('roster-progress').props.accessibilityValue).toEqual({ min: 0, max: roster.length, now: 1 }),
  );
});

it('navigates to RoutePreview when "View Route Map" is pressed pre-trip', async () => {
  const { getByTestId, findByText, nav } = await renderScreen();
  await findByText(/Route 7/);
  fireEvent.press(getByTestId('trip-view-route-map'));
  expect(nav.navigate).toHaveBeenCalledWith('RoutePreview');
});

it('shows a static pre-trip student pickup count with no roster data yet', async () => {
  const { getByTestId, findByText } = await renderScreen();
  await findByText(/Route 7/);
  const bar = getByTestId('pretrip-pickup-progress');
  expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 24, now: 0 });
});

it('shows the vehicle card with fallback text when no inspection or fuel records exist, and navigates to Vehicle Check', async () => {
  const { getByTestId, findByText, nav } = await renderScreen();
  await findByText(/Route 7/);
  expect(getByTestId('vehicle-last-inspection')).toHaveTextContent('Last inspection: None yet');
  expect(getByTestId('vehicle-last-fuel-entry')).toHaveTextContent('Last fuel entry: None yet');
  fireEvent.press(getByTestId('trip-vehicle-details'));
  expect(nav.navigate).toHaveBeenCalledWith('VehicleCheck');
});

it('keeps the vehicle card and Vehicle Check button reachable to a driver during an active trip', async () => {
  const { getByTestId, findByText, nav } = await renderScreen();
  await findByText(/Route 7/);
  fireEvent.press(getByTestId('trip-start'));
  await waitFor(() => expect(getByTestId('trip-end')).toBeTruthy());
  // Vehicle + fuel check must stay reachable while the trip is live, not only pre-trip.
  expect(getByTestId('vehicle-last-fuel-entry')).toBeTruthy();
  fireEvent.press(getByTestId('trip-vehicle-check'));
  expect(nav.navigate).toHaveBeenCalledWith('VehicleCheck');
});

it('navigates to LiveMap with the current tripId when "View Live Map" is pressed', async () => {
  const { getByTestId, findByText, nav, repos } = await renderScreen();
  await findByText(/Route 7/);
  fireEvent.press(getByTestId('trip-start'));
  await waitFor(() => expect(getByTestId('trip-end')).toBeTruthy());
  const liveTrip = await repos.trip.current();
  fireEvent.press(getByTestId('trip-view-map'));
  expect(nav.navigate).toHaveBeenCalledWith('LiveMap', { tripId: liveTrip!.id });
});

it('resumes broadcasting for a persisted live trip after an app restart', async () => {
  // A first "phone" starts the trip; its store persists the live trip via AsyncStorage.
  const seedRepos = createMockRepositories(await createStore());
  const started = await seedRepos.trip.startTrip('r1', 'pickup', 'bus');
  mockBroadcaster.getPersistedBroadcastTripId.mockResolvedValue(started.id);

  // Re-mounting reads that persisted trip back from the (shared, mocked) AsyncStorage,
  // as a restarted app process would.
  await renderScreen();
  await waitFor(() =>
    expect(mockBroadcaster.startBroadcast).toHaveBeenCalledWith(expect.objectContaining({ tripId: started.id })),
  );
});

it('does not start broadcasting on a phone that did not start the trip', async () => {
  const seedRepos = createMockRepositories(await createStore());
  await seedRepos.trip.startTrip('r1', 'pickup', 'bus');
  mockBroadcaster.getPersistedBroadcastTripId.mockResolvedValue(null);

  const { findByText } = await renderScreen();
  await findByText(/Broadcasting live/);
  await new Promise((r) => setTimeout(r, 0));
  expect(mockBroadcaster.startBroadcast).not.toHaveBeenCalled();
});

it('shows a clear message when the server refuses the start', async () => {
  const repos = createMockRepositories(await createStore());
  repos.trip.startTrip = jest.fn().mockRejectedValue(new (require('@/lib/errors').AppError)('not_assigned', 403, 'x'));
  const { findByTestId, findByText } = await renderScreen(repos);
  await findByText(/Route 7/);
  fireEvent.press(await findByTestId('trip-start'));
  expect(await findByText('You are not assigned to this bus.')).toBeTruthy();
});

it('ends the trip on the server before stopping the broadcast, so a failed end keeps GPS resumable', async () => {
  const order: string[] = [];
  const repos = createMockRepositories(await createStore());
  const originalEndTrip = repos.trip.endTrip.bind(repos.trip);
  repos.trip.endTrip = async (tripId: string) => {
    order.push('endTrip');
    return originalEndTrip(tripId);
  };
  mockBroadcaster.stopBroadcast.mockImplementation(async () => { order.push('stopBroadcast'); });

  const { getByTestId, findByText } = await renderScreen(repos);
  await findByText(/Route 7/);
  fireEvent.press(getByTestId('trip-start'));
  await waitFor(() => expect(getByTestId('trip-end')).toBeTruthy());
  fireEvent.press(getByTestId('trip-end'));
  await waitFor(() => expect(order).toEqual(['endTrip', 'stopBroadcast']));
});

it('keeps broadcasting and shows an error toast when ending the trip fails (e.g. offline)', async () => {
  const { AppError } = require('@/lib/errors');
  const repos = createMockRepositories(await createStore());
  const { getByTestId, findByText } = await renderScreen(repos);
  await findByText(/Route 7/);
  fireEvent.press(getByTestId('trip-start'));
  await waitFor(() => expect(getByTestId('trip-end')).toBeTruthy());

  repos.trip.endTrip = jest.fn().mockRejectedValue(new AppError('network', 0, 'offline'));
  fireEvent.press(getByTestId('trip-end'));

  expect(await findByText('Cannot reach the server. Please check your connection and try again.')).toBeTruthy();
  expect(mockBroadcaster.stopBroadcast).not.toHaveBeenCalled();
  // Still on the live-trip screen (not the summary card) — the trip is still active.
  expect(getByTestId('trip-end')).toBeTruthy();
});
