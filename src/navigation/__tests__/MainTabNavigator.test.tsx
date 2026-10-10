import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';
import { MainTabNavigator } from '@/navigation/MainTabNavigator';

jest.mock('@/screens/HomeScreen', () => ({ HomeScreen: () => null }));
jest.mock('@/screens/MessagesScreen', () => ({ MessagesScreen: () => null }));
jest.mock('@/screens/NotificationsScreen', () => ({ NotificationsScreen: () => null }));
jest.mock('@/screens/LeaveScreen', () => ({ LeaveScreen: () => null }));
jest.mock('@/screens/TasksScreen', () => ({ TasksScreen: () => null }));
jest.mock('@/screens/ProfileScreen', () => ({ ProfileScreen: () => null }));
jest.mock('@/screens/AttendanceScreen', () => ({ AttendanceScreen: () => null }));
jest.mock('@/screens/TripScreen', () => ({ TripScreen: () => null }));
jest.mock('@/screens/LiveMapScreen', () => ({ LiveMapScreen: () => null }));

// The custom TabBar reads the chat unread count, so the navigator needs the query + repo providers.
const repos = { chat: { threads: async () => [] } } as never;

describe('MainTabNavigator', () => {
  it('renders without crashing with Home, Inbox, Leave, Tasks, Me registered', () => {
    expect(() =>
      render(
        <SafeAreaProvider>
          <ThemeProvider>
            <QueryClientProvider client={new QueryClient()}>
              <RepositoryProvider repositories={repos}>
                <NavigationContainer>
                  <MainTabNavigator />
                </NavigationContainer>
              </RepositoryProvider>
            </QueryClientProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      )
    ).not.toThrow();
  });
});
