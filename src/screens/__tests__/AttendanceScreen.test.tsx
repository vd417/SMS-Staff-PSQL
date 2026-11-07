import React from 'react';
import { fireEvent, waitFor, render } from '@testing-library/react-native';
import { AppProviders } from '@/providers/AppProviders';
import { AttendanceScreen } from '@/screens/AttendanceScreen';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Device sits far from the seeded school location, so the real geo-derived
// state starts out-of-range and the __DEV__ toggle is what brings it in range.
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 0, longitude: 0, accuracy: 8 } }),
}));
jest.mock('@/features/attendance/hooks', () => ({
  useAttendanceStatus: () => ({ data: { checkedIn: false, lastLog: [], dutyPost: 'Bus / Route', geofenceRadiusM: 120 }, isLoading: false, refetch: jest.fn() }),
  useSchoolLocation: () => ({ data: { lat: 28.4595, lng: 77.0266, radiusMeters: 120, name: 'Greenfield Public School' }, isLoading: false }),
  useCheckIn: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(async () => {}), isPending: false }),
  useCheckOut: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(async () => {}), isPending: false }),
  useAttendanceHistory: () => ({ data: [] }),
}));

it('lets the user force "in range" via the dev toggle and enables check-in', async () => {
  const { getByTestId } = render(<AppProviders><AttendanceScreen navigation={{ goBack: jest.fn() } as any} /></AppProviders>);
  // Wait for AppProviders async store init so the screen is rendered
  await waitFor(() => getByTestId('demo-in-range'));
  fireEvent.press(getByTestId('demo-in-range'));
  await waitFor(() => expect(getByTestId('checkin-btn').props.accessibilityState?.disabled).toBe(false));
});
