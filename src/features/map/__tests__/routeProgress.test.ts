import { guideDashes, guideToPath, pathToNearestStop, splitRouteProgress } from '../routeProgress';
import type { MapCoord } from '../toMapCoords';

const path: MapCoord[] = [
  { latitude: 0, longitude: 0 },
  { latitude: 1, longitude: 0 },
  { latitude: 2, longitude: 0 },
  { latitude: 3, longitude: 0 },
];

describe('splitRouteProgress', () => {
  it('treats the whole path as ahead when there is no bus fix', () => {
    expect(splitRouteProgress(path, null)).toEqual({ traveled: [], ahead: path, offRoute: false });
  });

  it('highlights from the closest point on the line when the bus is on the route', () => {
    const { traveled, ahead, offRoute } = splitRouteProgress(path, { latitude: 1.5, longitude: 0 });
    expect(offRoute).toBe(false);
    expect(traveled[0]).toEqual(path[0]);
    expect(traveled[traveled.length - 1].latitude).toBeCloseTo(1.5, 4);
    expect(ahead[0]).toEqual(traveled[traveled.length - 1]);
    expect(ahead[ahead.length - 1]).toEqual(path[path.length - 1]);
  });

  it('draws the whole route as one line when the bus is off the route', () => {
    const split = splitRouteProgress(path, { latitude: 1.5, longitude: 0.01 });
    expect(split.offRoute).toBe(true);
    expect(split.traveled).toEqual([]);
    expect(split.ahead).toEqual(path);
  });

  it('puts everything ahead when the bus is at the start', () => {
    const { traveled, ahead, offRoute } = splitRouteProgress(path, { latitude: 0, longitude: 0 });
    expect(offRoute).toBe(false);
    expect(traveled).toEqual([{ latitude: 0, longitude: 0 }]);
    expect(ahead).toEqual(path);
  });

  it('puts everything traveled when the bus is at the end', () => {
    const { traveled, ahead, offRoute } = splitRouteProgress(path, { latitude: 3, longitude: 0 });
    expect(offRoute).toBe(false);
    expect(traveled).toEqual(path);
    expect(ahead).toEqual([{ latitude: 3, longitude: 0 }]);
  });

  it('highlights the route forward to the next stop', () => {
    const line = pathToNearestStop(path, { latitude: 0.4, longitude: 0 }, path);
    expect(line[0].latitude).toBeCloseTo(0.4, 1);
    expect(line[line.length - 1].latitude).toBeCloseTo(1, 1);
  });

  it('highlights a straight line to the nearest stop when the van is off the route', () => {
    const line = pathToNearestStop(path, { latitude: 0, longitude: 0.02 }, path);
    expect(line).toEqual([
      { latitude: 0, longitude: 0.02 },
      { latitude: 0, longitude: 0 },
    ]);
  });

  it('draws a dotted guide from the van to the nearest point on the path', () => {
    const guide = guideToPath(path, { latitude: 1, longitude: 0.01 });
    expect(guide).toHaveLength(2);
    expect(guide[0]).toEqual({ latitude: 1, longitude: 0.01 });
    expect(guide[1].latitude).toBeCloseTo(1, 4);
    expect(guide[1].longitude).toBeCloseTo(0, 4);
    const dashes = guideDashes(guide);
    expect(dashes.length).toBeGreaterThan(1);
    expect(dashes.every((seg) => seg.length === 2)).toBe(true);
  });

  it('omits the guide when the van is already on the path', () => {
    expect(guideToPath(path, { latitude: 1.5, longitude: 0 })).toEqual([]);
    expect(guideDashes([])).toEqual([]);
  });

  it('never throws on a degenerate (0 or 1 point) path', () => {
    expect(splitRouteProgress([], { latitude: 1, longitude: 1 })).toEqual({ traveled: [], ahead: [], offRoute: false });
    const one = [{ latitude: 5, longitude: 5 }];
    expect(splitRouteProgress(one, { latitude: 1, longitude: 1 })).toEqual({ traveled: [], ahead: one, offRoute: false });
  });
});
