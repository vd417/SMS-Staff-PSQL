import { zoomForSpeed, smoothHeading, nextFollowCamera } from '@/features/trip/followCamera';

describe('zoomForSpeed', () => {
  it('uses a close zoom at low speed', () => {
    expect(zoomForSpeed(0)).toBe(18);
    expect(zoomForSpeed(5)).toBe(18);
  });
  it('uses a wider zoom at high speed', () => {
    expect(zoomForSpeed(60)).toBe(16);
    expect(zoomForSpeed(120)).toBe(16);
  });
  it('interpolates for mid speeds', () => {
    const z = zoomForSpeed(32.5);
    expect(z).toBeGreaterThan(16);
    expect(z).toBeLessThan(18);
  });
  it('treats undefined speed as slow', () => {
    expect(zoomForSpeed(undefined)).toBe(18);
  });
});

describe('smoothHeading', () => {
  it('eases partway toward the target', () => {
    const h = smoothHeading(0, 100, 0.25);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(100);
  });
  it('takes the shortest angular path across the 0/360 wrap', () => {
    // target is 10, prev is 350 — shortest path is +20 -> lands near 0/360.
    const h = smoothHeading(350, 10, 0.5);
    expect(Math.min(h, 360 - h)).toBeLessThan(15);
  });
  it('reaches the target when factor is 1', () => {
    expect(smoothHeading(10, 40, 1)).toBeCloseTo(40, 5);
  });
});

describe('nextFollowCamera', () => {
  const base = { heading: 0, zoom: 17 };

  it('centers the camera on the fix with a tilt', () => {
    const r = nextFollowCamera(base, { latitude: 1, longitude: 2, headingDeg: 90, speedKmh: 30, accuracyM: 10 });
    expect(r).not.toBeNull();
    expect(r!.camera.center).toEqual({ latitude: 1, longitude: 2 });
    expect(r!.camera.pitch).toBeGreaterThan(0);
  });
  it('freezes the bearing at very low speed', () => {
    const r = nextFollowCamera({ heading: 42, zoom: 17 }, { latitude: 1, longitude: 2, headingDeg: 200, speedKmh: 1, accuracyM: 5 });
    expect(r!.camera.heading).toBe(42);
  });
  it('freezes the bearing when GPS heading is missing', () => {
    const r = nextFollowCamera({ heading: 42, zoom: 17 }, { latitude: 1, longitude: 2, speedKmh: 30, accuracyM: 5 });
    expect(r!.camera.heading).toBe(42);
  });
  it('skips the camera move when GPS accuracy is poor', () => {
    const r = nextFollowCamera(base, { latitude: 1, longitude: 2, headingDeg: 90, speedKmh: 30, accuracyM: 200 });
    expect(r).toBeNull();
  });
  it('eases the bearing toward the travel direction when moving', () => {
    const r = nextFollowCamera({ heading: 0, zoom: 17 }, { latitude: 1, longitude: 2, headingDeg: 90, speedKmh: 30, accuracyM: 5 });
    expect(r!.camera.heading).toBeGreaterThan(0);
    expect(r!.camera.heading).toBeLessThan(90);
    expect(r!.state.heading).toBe(r!.camera.heading);
  });
});
