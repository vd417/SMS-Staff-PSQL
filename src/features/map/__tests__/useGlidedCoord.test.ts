import { lerpCoord } from '../useGlidedCoord';

describe('lerpCoord', () => {
  const a = { latitude: 0, longitude: 0 };
  const b = { latitude: 10, longitude: 20 };

  it('returns the start at t=0 and the end at t=1', () => {
    expect(lerpCoord(a, b, 0)).toEqual(a);
    expect(lerpCoord(a, b, 1)).toEqual(b);
  });

  it('interpolates at the midpoint', () => {
    expect(lerpCoord(a, b, 0.5)).toEqual({ latitude: 5, longitude: 10 });
  });

  it('clamps t outside 0..1', () => {
    expect(lerpCoord(a, b, -2)).toEqual(a);
    expect(lerpCoord(a, b, 5)).toEqual(b);
  });
});
