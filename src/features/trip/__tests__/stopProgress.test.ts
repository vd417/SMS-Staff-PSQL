import { deriveStopProgress, routeStripFor, isAlreadyApplied, isStopResolved } from '../stopProgress';
import { AppError } from '@/lib/errors';
import type { Stop, StudentLite, Boarding, TripStops } from '@/data/domain';

const stops: Stop[] = [
  { id: 's2', name: 'Market', lat: 12.2, lng: 77.2, seq: 2 },
  { id: 's1', name: 'Gate', lat: 12.1, lng: 77.1, seq: 1 },
  { id: 's3', name: 'Chowk', lat: 12.3, lng: 77.3, seq: 3 },
];
const roster: StudentLite[] = [
  { id: 'st1', name: 'A', stopId: 's1' },
  { id: 'st2', name: 'B', stopId: 's1' },
];
const progress = (over: Partial<TripStops> = {}, departed: string[] = []): TripStops => ({
  tripId: 't1', currentStopId: null, schoolArrivedAt: null,
  stops: [...stops].sort((a, b) => a.seq - b.seq).map((s) => ({
    stopId: s.id, name: s.name, seq: s.seq, departedAt: departed.includes(s.id) ? '2026-09-26T02:00:00Z' : undefined,
  })),
  ...over,
});
const boarded = (id: string, stopId = 's1'): Boarding => ({ tripId: 't1', studentId: id, stopId, state: 'boarded', at: 'x' });

describe('deriveStopProgress', () => {
  it('is EN_ROUTE to the first stop (by seq) before any progress', () => {
    const p = deriveStopProgress(stops, progress(), roster, []);
    expect(p.state).toBe('EN_ROUTE');
    expect(p.activeStop?.id).toBe('s1');
    expect(p.departedCount).toBe(0);
  });

  it('is PICKUP_IN_PROGRESS at the server current stop', () => {
    const p = deriveStopProgress(stops, progress({ currentStopId: 's1' }), roster, [boarded('st1')]);
    expect(p.state).toBe('PICKUP_IN_PROGRESS');
    expect(p.activeStop?.id).toBe('s1');
    expect(p).toMatchObject({ assignedCount: 2, pickedUpCount: 1, remainingCount: 1, canDepart: false });
  });

  it('canDepart once every student at the current stop is resolved', () => {
    const b: Boarding[] = [boarded('st1'), { tripId: 't1', studentId: 'st2', stopId: 's1', state: 'absent', at: 'x' }];
    expect(deriveStopProgress(stops, progress({ currentStopId: 's1' }), roster, b).canDepart).toBe(true);
  });

  it('canDepart is true at a stop with no assigned students', () => {
    const p = deriveStopProgress(stops, progress({ currentStopId: 's2' }, ['s1']), roster, []);
    expect(p.canDepart).toBe(true);
    expect(p.assignedCount).toBe(0);
  });

  it('never advances on boarding alone: all students resolved but not departed stays at the stop', () => {
    const b: Boarding[] = [boarded('st1'), boarded('st2')];
    const p = deriveStopProgress(stops, progress({ currentStopId: 's1' }), roster, b);
    expect(p.activeStop?.id).toBe('s1');
    expect(p.state).toBe('PICKUP_IN_PROGRESS');
  });

  it('is EN_ROUTE to the next undeparted stop after a departure', () => {
    const p = deriveStopProgress(stops, progress({}, ['s1']), roster, []);
    expect(p.state).toBe('EN_ROUTE');
    expect(p.activeStop?.id).toBe('s2');
    expect(p.departedCount).toBe(1);
  });

  it('is ROUTE_COMPLETED when every stop is departed, with schoolArrived from the server', () => {
    const p = deriveStopProgress(stops, progress({ schoolArrivedAt: '2026-09-26T03:00:00Z' }, ['s1', 's2', 's3']), roster, []);
    expect(p.state).toBe('ROUTE_COMPLETED');
    expect(p.activeStop).toBeNull();
    expect(p.schoolArrived).toBe(true);
  });

  it('treats unloaded progress as EN_ROUTE to the first stop', () => {
    expect(deriveStopProgress(stops, undefined, roster, []).activeStop?.id).toBe('s1');
  });
});

describe('isStopResolved', () => {
  it('needs a boarding record for every assigned student', () => {
    expect(isStopResolved(stops[1], roster, [boarded('st1')])).toBe(false);
    expect(isStopResolved(stops[1], roster, [boarded('st1'), boarded('st2')])).toBe(true);
  });
});

describe('routeStripFor', () => {
  it('reports departed fraction and stop names', () => {
    expect(routeStripFor(stops, progress({ currentStopId: 's2' }, ['s1']))).toEqual({ progress: 1 / 3, currentStopName: 'Market', nextStopName: 'Chowk' });
    expect(routeStripFor(stops, progress({}, ['s1']))).toEqual({ progress: 1 / 3, currentStopName: 'Gate', nextStopName: 'Market' });
    expect(routeStripFor(stops, undefined)).toEqual({ progress: 0, currentStopName: undefined, nextStopName: 'Gate' });
  });
});

describe('isAlreadyApplied', () => {
  const conflict = (code: string) => new AppError(code, 409, code);
  it('treats a repeated arrival as applied', () => {
    expect(isAlreadyApplied(conflict('already_at_stop'), { kind: 'arrive', stopId: 's1' }, null)).toBe(true);
  });
  it('treats a repeated departure as applied only if the stop really departed', () => {
    expect(isAlreadyApplied(conflict('not_current_stop'), { kind: 'depart', stopId: 's1' }, progress({}, ['s1']))).toBe(true);
    expect(isAlreadyApplied(conflict('not_current_stop'), { kind: 'depart', stopId: 's1' }, progress())).toBe(false);
  });
  it('treats a repeated school arrival as applied only if recorded', () => {
    expect(isAlreadyApplied(conflict('invalid_state'), { kind: 'school' }, progress({ schoolArrivedAt: 'x' }))).toBe(true);
    expect(isAlreadyApplied(conflict('invalid_state'), { kind: 'school' }, progress())).toBe(false);
  });
  it('never swallows real failures', () => {
    expect(isAlreadyApplied(conflict('too_far'), { kind: 'arrive', stopId: 's1' }, null)).toBe(false);
    expect(isAlreadyApplied(new Error('boom'), { kind: 'arrive', stopId: 's1' }, null)).toBe(false);
  });
});
