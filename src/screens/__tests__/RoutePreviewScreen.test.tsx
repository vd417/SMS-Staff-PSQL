import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme';
import { RoutePreviewScreen } from '@/screens/RoutePreviewScreen';

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

jest.mock('@/features/trip/hooks', () => ({
  useTripAssignment: () => mockAssignment,
}));

jest.mock('@/features/trip/useRouteGeometry', () => ({
  useRouteGeometry: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));

jest.mock('@/features/map/LiveMapView', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const LiveMapView = ({ stops, liveMarker }: any) => (
    <View testID="live-map-view">
      <Text testID="stop-count">{stops.length}</Text>
      {liveMarker && <Text testID="has-live-marker">yes</Text>}
    </View>
  );
  return { __esModule: true, LiveMapView };
});

function renderScreen() {
  const nav = { goBack: jest.fn() };
  return render(
    <ThemeProvider>
      <RoutePreviewScreen navigation={nav as never} />
    </ThemeProvider>,
  );
}

it('renders the route stops on a static map with no live marker', () => {
  const { getByTestId, queryByTestId, getByText } = renderScreen();
  expect(getByTestId('stop-count')).toHaveTextContent('2');
  expect(queryByTestId('has-live-marker')).toBeNull();
  expect(getByText('Route 1')).toBeTruthy();
});
