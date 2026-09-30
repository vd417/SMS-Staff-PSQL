import React from 'react';
import { render, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme';
import { LiveMapView } from '@/features/map/LiveMapView.web';
import type { Stop } from '@/data/domain';

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const mockMapViewProps: any[] = [];

jest.mock('@teovilla/react-native-web-maps', () => {
  const { View } = require('react-native');
  const MockMapView = (props: any) => {
    // eslint-disable-next-line react/prop-types
    mockMapViewProps.push(props);
    return <View testID={props.testID}>{props.children}</View>;
  };
  const MockMarker = ({ testID, children }: any) => <View testID={testID}>{children}</View>;
  const MockPolyline = ({ testID }: any) => <View testID={testID} />;
  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
    Polyline: MockPolyline,
  };
});

const stops: Stop[] = [
  { id: 's1', name: 'Gate', lat: 12.1, lng: 77.1, seq: 1 },
  { id: 's2', name: 'Market', lat: 12.2, lng: 77.2, seq: 2 },
];

const stopsWithEta: Stop[] = [
  { id: 's1', name: 'Gate', lat: 12.1, lng: 77.1, seq: 1, etaMin: 5 },
  { id: 's2', name: 'Market', lat: 12.2, lng: 77.2, seq: 2, etaMin: 12 },
];

describe('LiveMapView (web)', () => {
  const OLD_ENV = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const OLD_MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID;
  afterEach(() => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = OLD_ENV;
    if (OLD_MAP_ID === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID = OLD_MAP_ID;
    mockMapViewProps.length = 0;
  });

  const availableGeometry = {
    routeId: 'r1', status: 'available' as const, format: 'google-encoded-polyline',
    geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', distanceMeters: 100, durationSeconds: 10,
    stopSequenceHash: 'h', generatedAt: null,
  };

  it('renders the map with markers and a polyline when an API key is present and geometry is available', () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    const { getAllByTestId, getByTestId } = renderWithTheme(
      <LiveMapView stops={stops} liveMarker={null} routeGeometry={availableGeometry} />
    );
    expect(getAllByTestId(/^map-stop-/)).toHaveLength(2);
    expect(getByTestId('map-polyline')).toBeTruthy();
  });

  it('passes provider="google" to the underlying MapView so it actually renders on web', () => {
    // @teovilla/react-native-web-maps' MapView returns null unless
    // provider === 'google' — omitting this prop silently blanks the map.
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    renderWithTheme(<LiveMapView stops={stops} liveMarker={null} />);
    expect(mockMapViewProps).toHaveLength(1);
    expect(mockMapViewProps[0].provider).toBe('google');
  });

  it('passes googleMapsMapId to the MapView when a Map ID is configured', () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID = 'test-map-id';
    renderWithTheme(<LiveMapView stops={stops} liveMarker={null} />);
    expect(mockMapViewProps).toHaveLength(1);
    expect(mockMapViewProps[0].googleMapsMapId).toBe('test-map-id');
  });

  it('highlights the nearest stop as the destination and marks earlier stops completed', () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    const { getByTestId } = renderWithTheme(
      <LiveMapView stops={stops} liveMarker={{ latitude: 12.2, longitude: 77.2 }} />
    );
    expect(within(getByTestId('map-stop-s1')).getByTestId('stop-marker-completed')).toBeTruthy();
    expect(within(getByTestId('map-stop-s2')).getByTestId('stop-marker-destination')).toBeTruthy();
  });

  it('renders a fallback card instead of the map when the API key is missing', () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = '';
    const { getByTestId, queryByTestId } = renderWithTheme(<LiveMapView stops={stops} liveMarker={null} />);
    expect(getByTestId('map-unavailable')).toBeTruthy();
    expect(queryByTestId('live-map')).toBeNull();
  });

  it('renders a distance/duration label at each route segment', () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    const { getByTestId } = renderWithTheme(<LiveMapView stops={stopsWithEta} liveMarker={null} />);
    const label = within(getByTestId('map-segment-0')).getByTestId('route-segment-label');
    expect(label).toHaveTextContent(/min/);
    expect(label).toHaveTextContent(/km/);
  });

  it('renders the decoded road-following polyline when geometry is available', () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    const { getByTestId } = renderWithTheme(
      <LiveMapView
        stops={stops}
        liveMarker={null}
        routeGeometry={{
          routeId: 'r1', status: 'available', format: 'google-encoded-polyline',
          geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', distanceMeters: 100, durationSeconds: 10,
          stopSequenceHash: 'h', generatedAt: null,
        }}
      />
    );
    expect(getByTestId('map-polyline')).toBeTruthy();
  });

  it('renders no polyline and a Route unavailable badge when geometry is unavailable', () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    const { queryByTestId, getByText } = renderWithTheme(
      <LiveMapView
        stops={stops}
        liveMarker={null}
        routeGeometry={{
          routeId: 'r1', status: 'unavailable', format: null,
          geometry: null, distanceMeters: null, durationSeconds: null,
          stopSequenceHash: 'h', generatedAt: null,
        }}
      />
    );
    expect(queryByTestId('map-polyline')).toBeNull();
    expect(getByText(/route unavailable/i)).toBeTruthy();
  });
});
