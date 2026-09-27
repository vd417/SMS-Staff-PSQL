import { renderHook } from '@testing-library/react-native';
import { useStopProgress } from '../useStopProgress';
import type { Stop, TripStops } from '@/data/domain';

const stops: Stop[] = [{ id: 's1', name: 'Gate', lat: 12.1, lng: 77.1, seq: 1 }];
const progress: TripStops = { tripId: 't1', currentStopId: 's1', schoolArrivedAt: null, stops: [{ stopId: 's1', name: 'Gate', seq: 1 }] };

describe('useStopProgress', () => {
  it('derives state from server progress, ignoring device GPS entirely', () => {
    const { result } = renderHook(() => useStopProgress(stops, progress, [], []));
    expect(result.current.state).toBe('PICKUP_IN_PROGRESS');
  });
});
