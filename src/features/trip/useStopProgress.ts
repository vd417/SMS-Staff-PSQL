import { useMemo } from 'react';
import type { Stop, StudentLite, Boarding, TripStops } from '@/data/domain';
import { deriveStopProgress, type StopProgress } from './stopProgress';

export type { StopProgress, StopProgressState } from './stopProgress';

export function useStopProgress(
  stops: Stop[], progress: TripStops | undefined, roster: StudentLite[], boarding: Boarding[],
): StopProgress {
  return useMemo(() => deriveStopProgress(stops, progress, roster, boarding), [stops, progress, roster, boarding]);
}
