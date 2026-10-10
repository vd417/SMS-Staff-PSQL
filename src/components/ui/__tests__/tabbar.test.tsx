import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithTheme } from '../testUtils';
import { TabBar } from '@/components/ui';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';

const state = { index: 0, routes: [{ key: 'Home', name: 'Home' }, { key: 'Leave', name: 'Leave' }, { key: 'Tasks', name: 'Tasks' }, { key: 'Me', name: 'Me' }] };
const descriptors = Object.fromEntries(state.routes.map(r => [r.key, { options: {} }]));

// TabBar reads the inbox unread count, so it needs the query + repository providers.
const repos = { announcements: { list: async () => [] } } as never;
const withProviders = (ui: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient()}>
    <RepositoryProvider repositories={repos}>{ui}</RepositoryProvider>
  </QueryClientProvider>
);

it('renders all tabs with no center FAB', () => {
  const navigation = { navigate: jest.fn(), emit: () => ({ defaultPrevented: false }) };
  const { getByTestId, queryByTestId } = renderWithTheme(
    withProviders(<TabBar state={state as any} navigation={navigation as any} descriptors={descriptors as any} />),
  );
  expect(getByTestId('tab-Home')).toBeTruthy();
  expect(getByTestId('tab-Me')).toBeTruthy();
  expect(queryByTestId('tab-fab')).toBeNull();
});

it('pressing a non-focused tab emits tabPress and navigates', () => {
  const navigate = jest.fn();
  const emit = jest.fn(() => ({ defaultPrevented: false }));
  const navigation = { navigate, emit };
  const { getByTestId } = renderWithTheme(
    withProviders(<TabBar state={state as any} navigation={navigation as any} descriptors={descriptors as any} />),
  );
  fireEvent.press(getByTestId('tab-Leave'));
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'tabPress', target: 'Leave' }));
  expect(navigate).toHaveBeenCalledWith('Leave');
});
