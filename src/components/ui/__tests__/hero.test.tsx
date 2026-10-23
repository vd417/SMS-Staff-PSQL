// src/components/ui/__tests__/hero.test.tsx
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithTheme } from '../testUtils';
import { HeroTodayCard } from '@/components/ui';

const BASE_PROPS = {
  timing: '7:30–3:30',
  dutyPostLabel: 'DUTY POST',
  dutyPost: 'Route 7',
  onPressCheckIn: jest.fn(),
};

describe('HeroTodayCard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('shows the check-in prompt and fires onPressCheckIn when not checked in', () => {
    const onPress = jest.fn();
    const { getByTestId } = renderWithTheme(
      <HeroTodayCard {...BASE_PROPS} checkedIn={false} onPressCheckIn={onPress} />,
    );
    fireEvent.press(getByTestId('hero-checkin'));
    expect(onPress).toHaveBeenCalled();
  });

  it('hides the check-in pressable, shows checked-in time, and clears the interval on unmount', () => {
    jest.useFakeTimers();

    // Use a fixed ISO string; formatLocalTime will produce a deterministic local time
    const checkInAt = new Date(2026, 5, 8, 7, 30, 0).toISOString(); // month is 0-indexed
    const clearSpy = jest.spyOn(global, 'clearInterval');

    const { queryByTestId, getByText, unmount } = renderWithTheme(
      <HeroTodayCard
        {...BASE_PROPS}
        checkedIn
        checkInAt={checkInAt}
        onPressCheckIn={jest.fn()}
      />,
    );

    // The check-in pressable must not be rendered when already checked in
    expect(queryByTestId('hero-checkin')).toBeNull();

    // The "Checked in at HH:MM AM/PM" text must be visible
    expect(getByText(/Checked in at/i)).toBeTruthy();

    // Unmounting must clear the running interval
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('fills the timing column with the check-in time when shift timing is blank', () => {
    const checkInAt = new Date(2026, 5, 8, 7, 30, 0).toISOString();
    const { getByTestId } = renderWithTheme(
      <HeroTodayCard {...BASE_PROPS} timing="" checkedIn checkInAt={checkInAt} onPressCheckIn={jest.fn()} />,
    );
    expect(getByTestId('hero-timing')).toHaveTextContent('7:30 AM');
  });
});
