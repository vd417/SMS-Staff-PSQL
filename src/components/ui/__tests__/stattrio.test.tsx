// src/components/ui/__tests__/stattrio.test.tsx
// Note: this file also covers what the B4 brief names `StatTrio.test.tsx` — on this
// case-insensitive filesystem that is the same path as this file, so its cases were
// added here instead of in a separately-cased file.
import React from 'react';
import { renderWithTheme } from '../testUtils';
import { StatTrio } from '@/components/ui';

it('renders hours, streak, and leave numbers', () => {
  const { getByText } = renderWithTheme(
    <StatTrio hoursThisWeek={34} hoursTarget={44} streakDays={21} leaveLeft={12} />,
  );
  expect(getByText('34')).toBeTruthy();
  expect(getByText(/21/)).toBeTruthy();
  expect(getByText(/12/)).toBeTruthy();
});

describe('StatTrio', () => {
  it('hides streak and leave cards when the server sends no data for them', () => {
    const { queryByTestId } = renderWithTheme(<StatTrio hoursThisWeek={10} hoursTarget={0} />);
    expect(queryByTestId('stat-streak')).toBeNull();
    expect(queryByTestId('stat-leave')).toBeNull();
  });

  it('shows them when present', () => {
    const { getByTestId } = renderWithTheme(
      <StatTrio hoursThisWeek={10} hoursTarget={48} streakDays={3} leaveLeft={5} />,
    );
    expect(getByTestId('stat-streak')).toBeTruthy();
    expect(getByTestId('stat-leave')).toBeTruthy();
  });
});
