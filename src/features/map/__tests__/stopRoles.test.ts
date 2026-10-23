import { stopRoles } from '@/features/map/stopRoles';
import type { Stop } from '@/data/domain';

const stops: Stop[] = [
  { id: 'a', name: 'Stop A', lat: 12.1, lng: 77.1, seq: 1 },
  { id: 'b', name: 'Stop B', lat: 12.2, lng: 77.2, seq: 2 },
  { id: 'c', name: 'Stop C', lat: 12.3, lng: 77.3, seq: 3 },
];

describe('stopRoles', () => {
  it('returns an empty array when there are no stops', () => {
    expect(stopRoles([], null)).toEqual([]);
  });

  it('marks the first stop next and the rest upcoming when there is no GPS fix yet', () => {
    const roles = stopRoles(stops, null);
    expect(roles.map((r) => r.role)).toEqual(['next', 'upcoming', 'upcoming']);
  });

  it('marks the last stop as the destination', () => {
    const roles = stopRoles(stops, null);
    expect(roles.map((r) => r.isDestination)).toEqual([false, false, true]);
  });

  it('marks the nearest stop current, prior stops completed, and the following stop next', () => {
    const roles = stopRoles(stops, { latitude: 12.2, longitude: 77.2 });
    expect(roles.map((r) => [r.stop.id, r.role])).toEqual([
      ['a', 'completed'],
      ['b', 'current'],
      ['c', 'next'],
    ]);
  });

  it('lights each stop near the bus when the bus is off the route', () => {
    const roles = stopRoles(stops, { latitude: 12.1018, longitude: 77.1 }, { offRoute: true });
    expect(roles.map((r) => [r.stop.id, r.near])).toEqual([
      ['a', true],
      ['b', false],
      ['c', false],
    ]);
  });

  it('does not treat a far stop as current while the bus is off the route', () => {
    const roles = stopRoles(stops, { latitude: 13, longitude: 78 }, { offRoute: true });
    expect(roles.every((r) => !r.near)).toBe(true);
    expect(roles.find((r) => r.role === 'current')).toBeUndefined();
  });

  it('leaves no stop marked next when the bus has reached the final stop', () => {
    const roles = stopRoles(stops, { latitude: 12.3, longitude: 77.3 });
    expect(roles.map((r) => [r.stop.id, r.role])).toEqual([
      ['a', 'completed'],
      ['b', 'completed'],
      ['c', 'current'],
    ]);
  });
});
