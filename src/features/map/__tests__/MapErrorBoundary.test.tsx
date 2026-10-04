import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { MapErrorBoundary } from '../MapErrorBoundary';

const Boom: React.FC = () => {
  throw new Error('map boom');
};

describe('MapErrorBoundary', () => {
  it('renders children when there is no error', () => {
    const { getByText } = render(
      <MapErrorBoundary fallback={() => <Text>fallback</Text>}>
        <Text>map ok</Text>
      </MapErrorBoundary>
    );
    expect(getByText('map ok')).toBeTruthy();
  });

  it('renders the fallback instead of crashing when a child throws', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { getByText, queryByText } = render(
      <MapErrorBoundary fallback={() => <Text>fallback</Text>}>
        <Boom />
      </MapErrorBoundary>
    );
    expect(getByText('fallback')).toBeTruthy();
    expect(queryByText('map ok')).toBeNull();
    spy.mockRestore();
  });
});
