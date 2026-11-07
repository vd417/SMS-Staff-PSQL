// src/components/ui/__tests__/primitives.test.tsx
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithTheme } from '../testUtils';
import { Btn, Avatar, Pill, Skeleton } from '@/components/ui';

describe('Btn', () => {
  it('calls onPress when enabled', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithTheme(<Btn label="Go" onPress={onPress} />);
    fireEvent.press(getByText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('does not call onPress while loading', () => {
    const onPress = jest.fn();
    const { queryByText, getByTestId } = renderWithTheme(<Btn label="Go" onPress={onPress} loading testID="b" />);
    fireEvent.press(getByTestId('b'));
    expect(onPress).not.toHaveBeenCalled();
    expect(queryByText('Go')).toBeNull(); // spinner replaces label
  });
});

describe('Avatar', () => {
  it('renders initials from a name', () => {
    const { getByText } = renderWithTheme(<Avatar name="Ramesh Kumar" />);
    expect(getByText('RK')).toBeTruthy();
  });
  it('renders a profile photo when a photo is provided', () => {
    const { getByTestId, queryByText } = renderWithTheme(
      <Avatar name="Ramesh Kumar" photoUri="https://cdn.example/ramesh.png" />,
    );
    expect(getByTestId('avatar-photo')).toBeTruthy();
    expect(queryByText('RK')).toBeNull();
  });
});

describe('Pill', () => {
  it('renders its label', () => {
    const { getByText } = renderWithTheme(<Pill label="On duty" color="#fff" bg="#0E5C4A" />);
    expect(getByText('On duty')).toBeTruthy();
  });
});

describe('Skeleton', () => {
  it('mounts without crashing', () => {
    const { toJSON } = renderWithTheme(<Skeleton width={100} height={12} />);
    expect(toJSON()).toBeTruthy();
  });
});
