import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { AppProviders } from '@/providers/AppProviders';
import { AttendanceScreen } from '@/screens/AttendanceScreen';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 0, longitude: 0, accuracy: 8 } }),
}));

const mockCheckInMutateAsync = jest.fn(async () => {});

jest.mock('@/features/attendance/hooks', () => {
  const today = new Date();
  return {
    useAttendanceStatus: () => ({
      data: {
        checkedIn: false,
        dutyPost: 'Bus / Route',
        geofenceRadiusM: 120,
        lastLog: [
          { at: new Date(new Date(today).setHours(17, 0)).toISOString(), kind: 'out', inZone: true },
          { at: new Date(new Date(today).setHours(9, 0)).toISOString(), kind: 'in', inZone: true },
        ],
      },
      isLoading: false,
      refetch: jest.fn(),
    }),
    useSchoolLocation: () => ({ data: { lat: 28.4595, lng: 77.0266, radiusMeters: 120, name: 'Greenfield Public School' }, isLoading: false }),
    useCheckIn: () => ({ mutate: jest.fn(), mutateAsync: mockCheckInMutateAsync, isPending: false }),
    useCheckOut: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(async () => {}), isPending: false }),
    useAttendanceHistory: () => ({ data: [] }),
  };
});

it('locks check-in for the rest of the day once today\'s check-in and check-out are both logged', async () => {
  const { getByTestId, findByText } = render(
    <AppProviders><AttendanceScreen navigation={{ goBack: jest.fn() } as any} /></AppProviders>,
  );

  expect(await findByText('Done for today')).toBeTruthy();
  const btn = getByTestId('checkin-btn');
  expect(btn.props.accessibilityState?.disabled).toBe(true);
  fireEvent.press(btn);
  expect(mockCheckInMutateAsync).not.toHaveBeenCalled();
});
