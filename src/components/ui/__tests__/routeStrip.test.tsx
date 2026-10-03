import React from 'react';
import { renderWithTheme } from '../testUtils';
import { RouteStrip } from '@/components/ui';
import type { RouteTimelineStop } from '@/features/trip/stopProgress';

const stops: RouteTimelineStop[] = [
  { id: 's0', name: 'School Gate', status: 'done' },
  { id: 's1', name: 'Sector 12', status: 'current' },
  { id: 's2', name: 'Sector 14 Market', status: 'next' },
  { id: 's3', name: 'Civil Lines Chowk', status: 'upcoming' },
];

it('lists every stop name as its own timeline row', () => {
  const { getByText } = renderWithTheme(<RouteStrip stops={stops} accent="#0E5C4A" />);
  expect(getByText('School Gate')).toBeTruthy();
  expect(getByText('Sector 12')).toBeTruthy();
  expect(getByText('Sector 14 Market')).toBeTruthy();
  expect(getByText('Civil Lines Chowk')).toBeTruthy();
});

it('marks each stop with its status', () => {
  const { getByTestId } = renderWithTheme(<RouteStrip stops={stops} accent="#0E5C4A" />);
  expect(getByTestId('route-stop-done')).toBeTruthy();
  expect(getByTestId('route-stop-current')).toBeTruthy();
  expect(getByTestId('route-stop-next')).toBeTruthy();
  expect(getByTestId('route-stop-upcoming')).toBeTruthy();
});
