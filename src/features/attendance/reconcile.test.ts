import { retainPunch, withTodayFlag } from './reconcile';
import type { Attendance } from '@/data/domain';

const now = new Date(2026, 9, 24, 0, 36, 0);
const at = now.toISOString();

const empty: Attendance = {
  checkedIn: false,
  lastLog: [],
  dutyPost: 'Transport',
  geofenceRadiusM: 80,
};

describe('retainPunch', () => {
  it('keeps a check-in the status payload dropped', () => {
    const next = retainPunch(empty, { at, kind: 'in', inZone: true }, now);
    expect(next.checkedIn).toBe(true);
    expect(next.checkInAt).toBe(at);
    expect(next.dutyPost).toBe('Transport');
    expect(next.lastLog[0]).toMatchObject({ at, kind: 'in' });
  });

  it('does not revive a punch from another day', () => {
    const yesterday = new Date(2026, 9, 23, 18, 0, 0).toISOString();
    const next = retainPunch(empty, { at: yesterday, kind: 'in', inZone: true }, now);
    expect(next).toBe(empty);
  });

  it('lets a later checkout win', () => {
    const server: Attendance = {
      ...empty,
      lastLog: [{ at: new Date(2026, 9, 24, 1, 0, 0).toISOString(), kind: 'out', inZone: true }],
    };
    const next = retainPunch(server, { at, kind: 'in', inZone: true }, now);
    expect(next.checkedIn).toBe(false);
  });
});

describe('withTodayFlag', () => {
  it('treats today\'s latest in-log as checked in', () => {
    const next = withTodayFlag({ ...empty, lastLog: [{ at, kind: 'in', inZone: false }] }, now);
    expect(next.checkedIn).toBe(true);
    expect(next.checkInAt).toBe(at);
  });
});
