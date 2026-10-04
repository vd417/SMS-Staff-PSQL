import { toMapCoords, isFiniteCoord } from '@/features/map/toMapCoords';
import type { Stop } from '@/data/domain';

describe('toMapCoords', () => {
  it('returns coordinates sorted by seq, regardless of input order', () => {
    const stops: Stop[] = [
      { id: 'b', name: 'Stop B', lat: 12.2, lng: 77.2, seq: 2 },
      { id: 'a', name: 'Stop A', lat: 12.1, lng: 77.1, seq: 1 },
      { id: 'c', name: 'Stop C', lat: 12.3, lng: 77.3, seq: 3 },
    ];
    expect(toMapCoords(stops)).toEqual([
      { latitude: 12.1, longitude: 77.1 },
      { latitude: 12.2, longitude: 77.2 },
      { latitude: 12.3, longitude: 77.3 },
    ]);
  });

  it('returns an empty array for no stops', () => {
    expect(toMapCoords([])).toEqual([]);
  });

  it('drops stops whose coordinates are null/NaN so no bad coord reaches a marker', () => {
    const stops = [
      { id: 'a', name: 'Good', lat: 12.1, lng: 77.1, seq: 1 },
      { id: 'b', name: 'Null lat', lat: null as unknown as number, lng: 77.2, seq: 2 },
      { id: 'c', name: 'NaN lng', lat: 12.3, lng: NaN, seq: 3 },
    ] as Stop[];
    expect(toMapCoords(stops)).toEqual([{ latitude: 12.1, longitude: 77.1 }]);
  });

  it('isFiniteCoord accepts finite numbers and rejects null/NaN/strings', () => {
    expect(isFiniteCoord(12.1, 77.1)).toBe(true);
    expect(isFiniteCoord(null, 77.1)).toBe(false);
    expect(isFiniteCoord(12.1, NaN)).toBe(false);
    expect(isFiniteCoord('12.1', 77.1)).toBe(false);
  });
});
