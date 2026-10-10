import { splitRouteProgress } from '../routeProgress';
import type { MapCoord } from '../toMapCoords';

const path: MapCoord[] = [
  { latitude: 0, longitude: 0 },
  { latitude: 1, longitude: 0 },
  { latitude: 2, longitude: 0 },
  { latitude: 3, longitude: 0 },
];

describe('splitRouteProgress', () => {
  it('treats the whole path as ahead when there is no bus fix', () => {
    expect(splitRouteProgress(path, null)).toEqual({ traveled: [], ahead: path });
  });

  it('splits at the vertex nearest the bus, overlapping that vertex so the lines join', () => {
    const { traveled, ahead } = splitRouteProgress(path, { latitude: 1.9, longitude: 0.1 });
    // nearest vertex is index 2 (lat 2)
    expect(traveled).toEqual([
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 },
      { latitude: 2, longitude: 0 },
    ]);
    expect(ahead).toEqual([
      { latitude: 2, longitude: 0 },
      { latitude: 3, longitude: 0 },
    ]);
    // the shared vertex guarantees no gap between the two drawn polylines
    expect(traveled[traveled.length - 1]).toEqual(ahead[0]);
  });

  it('puts everything ahead when the bus is at the start', () => {
    const { traveled, ahead } = splitRouteProgress(path, { latitude: 0, longitude: 0 });
    expect(traveled).toEqual([{ latitude: 0, longitude: 0 }]);
    expect(ahead).toEqual(path);
  });

  it('puts everything traveled when the bus is at the end', () => {
    const { traveled, ahead } = splitRouteProgress(path, { latitude: 3, longitude: 0 });
    expect(traveled).toEqual(path);
    expect(ahead).toEqual([{ latitude: 3, longitude: 0 }]);
  });

  it('never throws on a degenerate (0 or 1 point) path', () => {
    expect(splitRouteProgress([], { latitude: 1, longitude: 1 })).toEqual({ traveled: [], ahead: [] });
    const one = [{ latitude: 5, longitude: 5 }];
    expect(splitRouteProgress(one, { latitude: 1, longitude: 1 })).toEqual({ traveled: [], ahead: one });
  });
});
