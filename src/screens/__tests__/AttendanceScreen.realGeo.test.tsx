import React from 'react';
import { fireEvent, waitFor, render } from '@testing-library/react-native';
import { AppProviders } from '@/providers/AppProviders';
import { AttendanceScreen } from '@/screens/AttendanceScreen';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

const schoolLocation = { lat: 28.4595, lng: 77.0266, radiusMeters: 120, name: 'Greenfield Public School' };

// Device sits right at the school's geofence center — real GPS-derived state
// should be in-range with no need for the dev-only demo toggle.
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 28.4595, longitude: 77.0266, accuracy: 8 } }),
}));

const mockCheckInMutateAsync = jest.fn(async () => {});
jest.mock('@/features/attendance/hooks', () => ({
  useAttendanceStatus: () => ({ data: { checkedIn: false, lastLog: [], dutyPost: 'Bus / Route', geofenceRadiusM: 120 }, isLoading: false, refetch: jest.fn() }),
  useSchoolLocation: () => ({ data: { lat: 28.4595, lng: 77.0266, radiusMeters: 120, name: 'Greenfield Public School' }, isLoading: false }),
  useCheckIn: () => ({ mutate: jest.fn(), mutateAsync: mockCheckInMutateAsync, isPending: false }),
  useCheckOut: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(async () => {}), isPending: false }),
  useAttendanceHistory: () => ({ data: [] }),
}));

it('derives in-range from real GPS position vs. the fetched school location, with no demo toggle', async () => {
  const { getByTestId, queryByText } = render(
    <AppProviders><AttendanceScreen navigation={{ goBack: jest.fn() } as any} /></AppProviders>,
  );
  await waitFor(() => expect(getByTestId('checkin-btn').props.accessibilityState?.disabled).toBe(false));
  expect(queryByText('0 m away · move closer')).toBeNull();
});

it('sends the real device lat/lng/accuracy on check-in, not a hardcoded flag', async () => {
  const { getByTestId } = render(
    <AppProviders><AttendanceScreen navigation={{ goBack: jest.fn() } as any} /></AppProviders>,
  );
  await waitFor(() => expect(getByTestId('checkin-btn').props.accessibilityState?.disabled).toBe(false));
  fireEvent.press(getByTestId('checkin-btn'));
  await waitFor(() => expect(mockCheckInMutateAsync).toHaveBeenCalledWith(
    expect.objectContaining({ lat: schoolLocation.lat, lng: schoolLocation.lng, accuracyMeters: 8 }),
  ));
});
