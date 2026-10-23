import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';
import { createMockRepositories } from '@/data/repositories/factory';
import { createStore } from '@/data/mock/store';
import { useDashboard } from '@/features/dashboard/hooks';
import { useAttendanceStatus, useCheckIn } from '@/features/attendance/hooks';

jest.mock('@react-native-async-storage/async-storage', () => {
  let mem: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
      clear: jest.fn(() => { mem = {}; return Promise.resolve(); }),
    },
  };
});
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

let qc: QueryClient;

async function wrap(ui: React.ReactElement) {
  const repos = createMockRepositories(await createStore());
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RepositoryProvider repositories={repos}>{ui}</RepositoryProvider>
    </QueryClientProvider>,
  );
}

function DashboardProbe() {
  const { data, isLoading } = useDashboard();
  return <Text testID="dash">{isLoading ? 'loading' : `${data?.roleCard?.kind}:${data?.hoursThisWeek}`}</Text>;
}

function AttendanceProbe() {
  const { data } = useAttendanceStatus();
  const checkIn = useCheckIn();
  return (
    <>
      <Text testID="checked">{String(data?.checkedIn ?? '')}</Text>
      <Pressable
        testID="checkin"
        onPress={() => checkIn.mutate({ at: new Date().toISOString(), lat: 28.4595, lng: 77.0266, accuracyMeters: 8 })}
      >
        <Text>in</Text>
      </Pressable>
    </>
  );
}

describe('feature hooks', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });
  afterEach(() => {
    qc.clear();
  });

  it('useDashboard loads the role-driven dashboard', async () => {
    await wrap(<DashboardProbe />);
    await waitFor(() => expect(screen.getByTestId('dash')).toHaveTextContent('driver:34'));
  });

  it('useCheckIn optimistically flips checkedIn to true', async () => {
    await wrap(<AttendanceProbe />);
    await waitFor(() => expect(screen.getByTestId('checked')).toHaveTextContent('false'));
    fireEvent.press(screen.getByTestId('checkin'));
    await waitFor(() => expect(screen.getByTestId('checked')).toHaveTextContent('true'));
  });

  it('keeps the home status checked in when the server drops the punch', async () => {
    const repos = createMockRepositories(await createStore());
    const dropped = { checkedIn: false, lastLog: [], dutyPost: 'Transport', geofenceRadiusM: 80 };
    const status = jest.fn(async () => dropped);
    repos.attendance = {
      ...repos.attendance,
      status,
      checkIn: jest.fn(async () => dropped),
    };
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <RepositoryProvider repositories={repos}>
          <AttendanceProbe />
        </RepositoryProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('checked')).toHaveTextContent('false'));
    const before = status.mock.calls.length;
    fireEvent.press(screen.getByTestId('checkin'));
    await waitFor(() => expect(status.mock.calls.length).toBeGreaterThan(before));
    expect(screen.getByTestId('checked')).toHaveTextContent('true');
  });
});
