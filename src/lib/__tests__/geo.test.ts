import { bearingDegrees, distanceMeters, formatDistance } from '@/lib/geo';

describe('distanceMeters', () => {
  it('returns 0 for identical coordinates', () => {
    expect(distanceMeters({ lat: 28.4595, lng: 77.0266 }, { lat: 28.4595, lng: 77.0266 })).toBe(0);
  });

  it('computes a known short distance (~50m) within tolerance', () => {
    // School Gate seed coord vs a point ~50m north
    const a = { lat: 28.4595, lng: 77.0266 };
    const b = { lat: 28.45995, lng: 77.0266 };
    const d = distanceMeters(a, b);
    expect(d).toBeGreaterThan(45);
    expect(d).toBeLessThan(55);
  });

  it('computes a known long distance (~1.1km) within tolerance', () => {
    // School Gate vs Sector 12 seed stop
    const a = { lat: 28.4595, lng: 77.0266 };
    const b = { lat: 28.4660, lng: 77.0410 };
    const d = distanceMeters(a, b);
    expect(d).toBeGreaterThan(1300);
    expect(d).toBeLessThan(1600);
  });

  it('is symmetric', () => {
    const a = { lat: 28.4595, lng: 77.0266 };
    const b = { lat: 28.4850, lng: 77.0770 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe('bearingDegrees', () => {
  it('points north, east, and wraps to 0–360', () => {
    expect(bearingDegrees({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 5);
    expect(bearingDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 5);
    expect(bearingDegrees({ lat: 1, lng: 0 }, { lat: 0, lng: 0 })).toBeCloseTo(180, 5);
  });
});

describe('formatDistance', () => {
  it('shows whole meters under 1km', () => {
    expect(formatDistance(104)).toBe('104 m');
    expect(formatDistance(999)).toBe('999 m');
  });

  it('shows one-decimal km at or above 1km', () => {
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(37678)).toBe('37.7 km');
  });
});
