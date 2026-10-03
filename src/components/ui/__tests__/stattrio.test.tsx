// src/components/ui/__tests__/stattrio.test.tsx
import React from 'react';
import { renderWithTheme } from '../testUtils';
import { StatTrio } from '@/components/ui';

describe('StatTrio', () => {
  it('renders the streak and leave numbers', () => {
    const { getByText } = renderWithTheme(<StatTrio streakDays={21} leaveLeft={12} />);
    expect(getByText(/21/)).toBeTruthy();
    expect(getByText(/12/)).toBeTruthy();
  });

  it('renders nothing when the server sends no streak/leave data', () => {
    const { queryByTestId } = renderWithTheme(<StatTrio />);
    expect(queryByTestId('stat-streak')).toBeNull();
    expect(queryByTestId('stat-leave')).toBeNull();
  });

  it('shows the streak and leave cards when present', () => {
    const { getByTestId } = renderWithTheme(<StatTrio streakDays={3} leaveLeft={5} />);
    expect(getByTestId('stat-streak')).toBeTruthy();
    expect(getByTestId('stat-leave')).toBeTruthy();
  });
});
