import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme';
import { ToastProvider } from '@/components/ui';
import { LiveMapScreen } from '@/screens/LiveMapScreen';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  watchPositionAsync: jest.fn(async (_opts, cb) => {
    cb({ coords: { latitude: 12.11, longitude: 77.11 } });
    return { remove: jest.fn() };
  }),
  Accuracy: { Balanced: 3 },
}));

const mockAssignment = {
  data: {
    route: {
      id: 'r1', name: 'Route 1', assignedBusNo: 'KA-01',
      stops: [
        { id: 's1', name: 'Gate', lat: 12.1, lng: 77.1, seq: 1 },
        { id: 's2', name: 'Market', lat: 12.2, lng: 77.2, seq: 2 },
      ],
    },
    busNo: 'KA-01',
  },
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};
const mockCurrent = { data: { id: 't1', routeId: 'r1', busNo: 'KA-01', driverId: 'd1', direction: 'pickup', status: 'live' }, isLoading: false };
const mockRoster = { data: [{ id: 'st1', name: 'Riya', stopId: 's2' }] as any[] };
const mockBoarding = { data: [] as any[], setBoarding: { mutate: jest.fn() } };
const mockStops = { data: undefined as any, isLoading: false };
const mockAction = { mutate: jest.fn(), isPending: false, variables: undefined as any };

jest.mock('@/features/trip/hooks', () => ({
  useTripAssignment: () => mockAssignment,
  useCurrentTrip: () => mockCurrent,
  useRoster: () => mockRoster,
  useBoarding: () => mockBoarding,
  useTripStops: () => mockStops,
  useStopActions: () => mockAction,
}));

jest.mock('@/features/trip/useRouteGeometry', () => ({
  useRouteGeometry: () => ({ data: undefined, isLoading: false }),
}));

jest.mock('@/features/trip/useResumeBroadcast', () => ({ useResumeBroadcast: () => undefined }));

const mockMapHandle = { animateToRegion: jest.fn(), fitToCoordinates: jest.fn() };

jest.mock('@/features/map/LiveMapView', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const LiveMapView = React.forwardRef(({ stops, liveMarker, onMapReady }: any, ref: any) => {
    React.useImperativeHandle(ref, () => mockMapHandle);
    React.useEffect(() => { onMapReady?.(); }, [onMapReady]);
    return (
      <View testID="live-map-view">
        <Text testID="stop-count">{stops.length}</Text>
        {liveMarker && <Text testID="has-live-marker">yes</Text>}
      </View>
    );
  });
  return { LiveMapView };
});

const renderScreen = () =>
  render(
    <ThemeProvider>
      <ToastProvider>
        <LiveMapScreen navigation={{ goBack: jest.fn() }} route={{ params: { tripId: 't1' } }} />
      </ToastProvider>
    </ThemeProvider>
  );

describe('LiveMapScreen', () => {
  const originalStops = mockAssignment.data.route.stops;

  beforeEach(() => {
    mockMapHandle.animateToRegion.mockClear();
    mockMapHandle.fitToCoordinates.mockClear();
    mockAssignment.data.route.stops = originalStops;
    mockRoster.data = [{ id: 'st1', name: 'Riya', stopId: 's2' }];
    mockBoarding.data = [];
    mockStops.data = {
      tripId: 't1',
      currentStopId: null,
      schoolArrivedAt: null,
      stops: [
        { stopId: 's1', name: 'Gate', seq: 1 },
        { stopId: 's2', name: 'Market', seq: 2 },
      ],
    };
    mockAction.mutate.mockReset();
    mockAction.isPending = false;
    mockAction.variables = undefined;
    mockCurrent.data.direction = 'pickup';
  });

  it('renders a compact header with the bus number, direction, route name and a LIVE status pill', async () => {
    const { getByText, getAllByText } = renderScreen();
    await waitFor(() => expect(getAllByText('LIVE').length).toBeGreaterThan(0));
    expect(getByText('KA-01')).toBeTruthy();
    expect(getByText('Route 1')).toBeTruthy();
  });

  it('shows the next (active) stop with a distance to it once GPS resolves', async () => {
    // currentStopId is null and no stop has departed, so s1 (Gate, seq 1) is active.
    const { getByTestId, getByText } = renderScreen();
    await waitFor(() => expect(getByTestId('has-live-marker')).toBeTruthy());
    expect(getByText('Gate')).toBeTruthy();
    expect(getByTestId('view-students-btn')).toBeTruthy();
  });

  it('recenters the map on the live marker when the recenter button is pressed', async () => {
    const { getByTestId } = renderScreen();
    await waitFor(() => expect(getByTestId('has-live-marker')).toBeTruthy());
    fireEvent.press(getByTestId('recenter-btn'));
    expect(mockMapHandle.animateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 12.11, longitude: 77.11 }),
      expect.any(Number)
    );
  });

  it('renders the map with stops and the live marker once GPS resolves', async () => {
    const { getByTestId } = renderScreen();
    await waitFor(() => expect(getByTestId('has-live-marker')).toBeTruthy());
    expect(getByTestId('stop-count').props.children).toBe(2);
  });

  it('shows a toast and still renders stops when location permission is denied', async () => {
    const Location = require('expo-location');
    Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    const { getByTestId, queryByTestId } = renderScreen();
    await waitFor(() => expect(getByTestId('live-map-view')).toBeTruthy());
    expect(queryByTestId('has-live-marker')).toBeNull();
  });

  it('still renders the map without a live marker when watchPositionAsync throws', async () => {
    const Location = require('expo-location');
    Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    Location.watchPositionAsync.mockRejectedValueOnce(new Error('GPS unavailable'));
    const { getByTestId, queryByTestId } = renderScreen();
    await waitFor(() => expect(getByTestId('live-map-view')).toBeTruthy());
    expect(queryByTestId('has-live-marker')).toBeNull();
  });

  it('removes the GPS subscription if the screen unmounts before watchPositionAsync resolves', async () => {
    const Location = require('expo-location');
    const removeMock = jest.fn();
    let resolveWatch: (value: { remove: () => void }) => void;
    const watchPromise = new Promise<{ remove: () => void }>((resolve) => {
      resolveWatch = resolve;
    });
    Location.watchPositionAsync.mockImplementationOnce(() => watchPromise);

    const { unmount } = renderScreen();

    await waitFor(() => expect(Location.watchPositionAsync).toHaveBeenCalled());
    unmount();

    resolveWatch!({ remove: removeMock });
    await waitFor(() => expect(removeMock).toHaveBeenCalledTimes(1));
  });

  it('opens the device maps app with the active stop\'s coordinates when Navigate is pressed', async () => {
    const { Linking } = require('react-native');
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const { getByTestId } = renderScreen();
    await waitFor(() => expect(getByTestId('has-live-marker')).toBeTruthy());
    fireEvent.press(getByTestId('navigate-btn'));
    // Active stop is s1 (Gate) by default (currentStopId null, nothing departed).
    expect(Linking.openURL).toHaveBeenCalledWith(
      expect.stringContaining('destination=12.1,77.1')
    );
  });

  it('EN_ROUTE shows Arrived for the next stop and confirms it on tap', async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId('arrived-btn'));
    expect(mockAction.mutate).toHaveBeenCalledWith({ kind: 'arrive', stopId: 's1' }, expect.any(Object));
  });

  it('shows the too_far message inline', async () => {
    mockAction.mutate.mockImplementation((_a: unknown, opts: any) => opts.onError(new (require('@/lib/errors').AppError)('too_far', 409, 'x')));
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId('arrived-btn'));
    expect((await findByTestId('stop-action-error')).props.children).toBe('Not close enough to the stop yet.');
  });

  it('shows the no_location message inline', async () => {
    mockAction.mutate.mockImplementation((_a: unknown, opts: any) => opts.onError(new (require('@/lib/errors').AppError)('no_location', 409, 'x')));
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId('arrived-btn'));
    expect((await findByTestId('stop-action-error')).props.children).toBe('Waiting for GPS location — try again in a moment.');
  });

  it('PICKUP_IN_PROGRESS disables Depart stop until every student is resolved', async () => {
    mockStops.data = { ...mockStops.data, currentStopId: 's2' };
    mockStops.data.stops[0].departedAt = 'x';
    const { findByTestId, getByTestId } = renderScreen();
    expect((await findByTestId('depart-stop-btn')).props.accessibilityState?.disabled).toBe(true);
    expect(getByTestId('depart-hint')).toBeTruthy();
  });

  it('marks every unresolved student at the active stop as boarded, but does not overwrite one already marked absent', async () => {
    mockStops.data = { ...mockStops.data, currentStopId: 's2' };
    mockStops.data.stops[0].departedAt = 'x';
    mockRoster.data = [
      { id: 'st1', name: 'Riya', stopId: 's2' },
      { id: 'st2', name: 'Kabir', stopId: 's2' },
    ];
    mockBoarding.data = [
      { tripId: 't1', studentId: 'st2', stopId: 's2', state: 'absent', at: '2026-09-20T00:00:00Z' },
    ];
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId('mark-picked-up-btn'));
    expect(mockBoarding.setBoarding.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: 't1', studentId: 'st1', stopId: 's2', state: 'boarded' })
    );
    expect(mockBoarding.setBoarding.mutate).not.toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 'st2' })
    );
    expect(mockAction.mutate).not.toHaveBeenCalled();
  });

  it('Depart stop calls complete once resolved, and marking pickups never departs by itself', async () => {
    mockStops.data = { ...mockStops.data, currentStopId: 's2' };
    mockBoarding.data = [{ tripId: 't1', studentId: 'st1', stopId: 's2', state: 'boarded', at: 'x' }];
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId('mark-picked-up-btn'));
    expect(mockAction.mutate).not.toHaveBeenCalled();
    fireEvent.press(await findByTestId('depart-stop-btn'));
    expect(mockAction.mutate).toHaveBeenCalledWith({ kind: 'depart', stopId: 's2' }, expect.any(Object));
  });

  it('shows a brief confirmation once Depart stop succeeds', async () => {
    mockStops.data = { ...mockStops.data, currentStopId: 's2' };
    mockBoarding.data = [{ tripId: 't1', studentId: 'st1', stopId: 's2', state: 'boarded', at: 'x' }];
    mockAction.mutate.mockImplementation((_a: unknown, opts: any) => opts.onSuccess());
    jest.useFakeTimers();
    try {
      const { findByTestId, queryByTestId } = renderScreen();
      fireEvent.press(await findByTestId('depart-stop-btn'));
      expect(await findByTestId('stop-completed-confirm')).toHaveTextContent('Market', { exact: false });
      await act(async () => {
        jest.advanceTimersByTime(1200);
      });
      expect(queryByTestId('stop-completed-confirm')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('ROUTE_COMPLETED on a pickup trip offers Arrived at school', async () => {
    mockStops.data.stops.forEach((s: any) => { s.departedAt = 'x'; });
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId('school-arrived-btn'));
    expect(mockAction.mutate).toHaveBeenCalledWith({ kind: 'school' }, expect.any(Object));
  });

  it('ROUTE_COMPLETED on a drop trip goes back to the Trip screen to end it', async () => {
    mockCurrent.data.direction = 'drop';
    mockStops.data.stops.forEach((s: any) => { s.departedAt = 'x'; });
    const { findByTestId, queryByTestId } = renderScreen();
    expect(await findByTestId('back-to-trip-btn')).toBeTruthy();
    expect(queryByTestId('school-arrived-btn')).toBeNull();
  });

  it('does not show the route-complete card (or its Arrived-at-school button) while stops is still empty', async () => {
    mockAssignment.data.route.stops = [];
    const { queryByTestId } = renderScreen();
    await act(async () => {
      await Promise.resolve();
    });
    expect(queryByTestId('school-arrived-btn')).toBeNull();
    expect(queryByTestId('back-to-trip-btn')).toBeNull();
  });
});
