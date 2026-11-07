import type { AttendanceRepository } from '@/data/repositories/types';
import type { Attendance } from '@/data/domain';
import type { Store } from './store';
import { simulateLatency } from '@/lib/latency';
import { distanceMeters } from '@/lib/geo';

const clone = (a: Attendance): Attendance => ({ ...a, lastLog: a.lastLog.map((l) => ({ ...l })) });

export function mockAttendance(store: Store): AttendanceRepository {
  // Mirrors the real backend: distance is computed server-side from the stored
  // school location, never trusted from the client.
  const verify = (lat: number, lng: number) =>
    distanceMeters({ lat, lng }, store.schoolLocation) <= store.schoolLocation.radiusMeters;

  return {
    async status() {
      await simulateLatency();
      return clone(store.attendance);
    },
    async history() {
      await simulateLatency();
      const dates = new Set<string>();
      for (const log of store.attendance.lastLog) {
        if (log.kind !== 'in') continue;
        const d = new Date(log.at);
        if (Number.isNaN(d.getTime())) continue;
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dates.add(`${d.getFullYear()}-${month}-${day}`);
      }
      return [...dates].map((date) => ({ date, checkedIn: true }));
    },
    async schoolLocation() {
      await simulateLatency();
      return { ...store.schoolLocation };
    },
    async checkIn(at, lat, lng) {
      await simulateLatency();
      const inZone = verify(lat, lng);
      store.attendance = {
        ...store.attendance,
        checkedIn: true,
        checkInAt: at,
        lastLog: [{ at, kind: 'in', inZone }, ...store.attendance.lastLog],
      };
      await store.persistAttendance();
      return clone(store.attendance);
    },
    async checkOut(at, lat, lng) {
      await simulateLatency();
      const inZone = verify(lat, lng);
      store.attendance = {
        ...store.attendance,
        checkedIn: false,
        checkInAt: undefined,
        lastLog: [{ at, kind: 'out', inZone }, ...store.attendance.lastLog],
      };
      await store.persistAttendance();
      return clone(store.attendance);
    },
  };
}
