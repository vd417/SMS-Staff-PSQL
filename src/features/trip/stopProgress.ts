import type { Stop, StudentLite, Boarding, TripStops } from '@/data/domain';
import { isAppError } from '@/lib/errors';

export interface StopPickupCounts {
  assignedCount: number;
  pickedUpCount: number;
  remainingCount: number;
}

export type StopProgressState = 'EN_ROUTE' | 'PICKUP_IN_PROGRESS' | 'ROUTE_COMPLETED';

export interface StopProgress extends StopPickupCounts {
  state: StopProgressState;
  /** The current stop (PICKUP_IN_PROGRESS) or the next one to reach (EN_ROUTE). */
  activeStop: Stop | null;
  departedCount: number;
  /** Every rostered student at the current stop has a boarding record. */
  canDepart: boolean;
  schoolArrived: boolean;
}

export type StopAction = { kind: 'arrive'; stopId: string } | { kind: 'depart'; stopId: string } | { kind: 'school' };

const RESOLVED_STATES = ['boarded', 'dropped', 'absent'] as const;

export function isStopResolved(stop: Stop, roster: StudentLite[], boarding: Boarding[]): boolean {
  const assigned = roster.filter((s) => s.stopId === stop.id);
  if (assigned.length === 0) return true;
  return assigned.every((s) => {
    const state = boarding.find((b) => b.studentId === s.id)?.state;
    return state != null && (RESOLVED_STATES as readonly string[]).includes(state);
  });
}

export function countPickup(activeStop: Stop | null, roster: StudentLite[], boarding: Boarding[]): StopPickupCounts {
  if (!activeStop) return { assignedCount: 0, pickedUpCount: 0, remainingCount: 0 };
  const assigned = roster.filter((s) => s.stopId === activeStop.id);
  const pickedUp = assigned.filter((s) => boarding.find((b) => b.studentId === s.id)?.state === 'boarded');
  return { assignedCount: assigned.length, pickedUpCount: pickedUp.length, remainingCount: assigned.length - pickedUp.length };
}

const bySeq = (stops: Stop[]) => [...stops].sort((a, b) => a.seq - b.seq);

/**
 * Stop state comes only from the server's TripStopProgress: the current stop is the one the
 * server confirmed and hasn't departed; otherwise the next stop without a departure. Boarding
 * and device GPS never move the trip forward — only an explicit Arrived / Depart stop tap does.
 */
export function deriveStopProgress(
  stops: Stop[], progress: TripStops | undefined, roster: StudentLite[], boarding: Boarding[],
): StopProgress {
  const sorted = bySeq(stops);
  const departed = new Set((progress?.stops ?? []).filter((s) => s.departedAt).map((s) => s.stopId));
  const current = progress?.currentStopId ? sorted.find((s) => s.id === progress.currentStopId) ?? null : null;
  const activeStop = current ?? sorted.find((s) => !departed.has(s.id)) ?? null;
  const state: StopProgressState = current ? 'PICKUP_IN_PROGRESS' : activeStop ? 'EN_ROUTE' : 'ROUTE_COMPLETED';
  return {
    state,
    activeStop,
    ...countPickup(activeStop, roster, boarding),
    departedCount: sorted.filter((s) => departed.has(s.id)).length,
    canDepart: current != null && isStopResolved(current, roster, boarding),
    schoolArrived: !!progress?.schoolArrivedAt,
  };
}

/** RouteStrip inputs from server progress: fraction of stops departed and the stops around the bus. */
export function routeStripFor(
  stops: Stop[], progress: TripStops | undefined,
): { progress: number; currentStopName?: string; nextStopName?: string } {
  const sorted = bySeq(stops);
  if (sorted.length === 0) return { progress: 0 };
  const departed = new Set((progress?.stops ?? []).filter((s) => s.departedAt).map((s) => s.stopId));
  const departedCount = sorted.filter((s) => departed.has(s.id)).length;
  const currentIdx = progress?.currentStopId ? sorted.findIndex((s) => s.id === progress.currentStopId) : -1;
  if (currentIdx >= 0) {
    return { progress: departedCount / sorted.length, currentStopName: sorted[currentIdx].name, nextStopName: sorted[currentIdx + 1]?.name };
  }
  const nextIdx = sorted.findIndex((s) => !departed.has(s.id));
  return {
    progress: departedCount / sorted.length,
    currentStopName: nextIdx > 0 ? sorted[nextIdx - 1].name : nextIdx === -1 ? sorted[sorted.length - 1].name : undefined,
    nextStopName: nextIdx >= 0 ? sorted[nextIdx].name : undefined,
  };
}

/**
 * A retried or concurrent tap (driver and conductor both pressing) that the server rejects
 * only because the transition already happened is a success, not an error.
 */
export function isAlreadyApplied(err: unknown, action: StopAction, fresh: TripStops | null): boolean {
  if (!isAppError(err) || err.status !== 409) return false;
  if (action.kind === 'arrive') return err.code === 'already_at_stop';
  if (action.kind === 'depart') {
    return err.code === 'not_current_stop' && !!fresh?.stops.find((s) => s.stopId === action.stopId)?.departedAt;
  }
  return err.code === 'invalid_state' && !!fresh?.schoolArrivedAt;
}
