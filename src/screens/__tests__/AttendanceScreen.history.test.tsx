import React from 'react';
import { render } from '@testing-library/react-native';
import { AppProviders } from '@/providers/AppProviders';
import { AttendanceScreen } from '@/screens/AttendanceScreen';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 0, longitude: 0, accuracy: 8 } }),
}));

jest.mock('@/features/attendance/hooks', () => {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  return {
  useAttendanceStatus: () => ({
    data: {
      checkedIn: false,
      dutyPost: 'Bus / Route',
      geofenceRadiusM: 120,
      lastLog: [
        { at: new Date(new Date(today).setHours(9, 15)).toISOString(), kind: 'out', inZone: true },
        { at: new Date(new Date(today).setHours(8, 0)).toISOString(), kind: 'in', inZone: true },
        { at: new Date(new Date(yesterday).setHours(18, 30)).toISOString(), kind: 'out', inZone: false },
      ],
    },
    isLoading: false,
    refetch: jest.fn(),
  }),
  useSchoolLocation: () => ({ data: { lat: 28.4595, lng: 77.0266, radiusMeters: 120, name: 'Greenfield Public School' }, isLoading: false }),
  useCheckIn: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(async () => {}), isPending: false }),
  useCheckOut: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(async () => {}), isPending: false }),
  useAttendanceHistory: () => ({ data: [] }),
  };
});

it('renders full check-in/check-out history grouped by day with zone status', async () => {
  const { findByText, getAllByText } = render(
    <AppProviders><AttendanceScreen navigation={{ goBack: jest.fn() } as any} /></AppProviders>,
  );

  await findByText('History');
  expect(await findByText('Today')).toBeTruthy();
  expect(await findByText('Yesterday')).toBeTruthy();
  expect(getAllByText('Inside duty zone').length).toBeGreaterThan(0);
  expect(await findByText('Outside duty zone')).toBeTruthy();
});
