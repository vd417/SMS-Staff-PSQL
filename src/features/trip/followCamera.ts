// Pure helpers for the Uber/Ola-style follow camera. No React, no map SDK — just
// the math for bearing smoothing, speed-based zoom and GPS gating, so it can be
// unit-tested and reused imperatively by LiveMapScreen without re-renders.

export interface FollowFix {
  latitude: number;
  longitude: number;
  headingDeg?: number;
  speedKmh?: number;
  accuracyM?: number;
}

/** The last camera values we applied, carried between fixes so transitions ease. */
export interface CameraState {
  heading: number;
  zoom: number;
}

export interface FollowCamera {
  center: { latitude: number; longitude: number };
  heading: number;
  pitch: number;
  zoom: number;
}

// Below this speed GPS heading is unreliable (a stationary phone reports random
// bearings), so we hold the last stable bearing instead of rotating the map.
const MIN_SPEED_FOR_HEADING_KMH = 5;
// Ignore fixes worse than this for the camera so a bad GPS lock can't yank the view.
const MAX_ACCURACY_M = 50;
const PITCH_DEG = 45;
const ZOOM_SLOW = 18;
const ZOOM_FAST = 16;
const SPEED_SLOW_KMH = 5;
const SPEED_FAST_KMH = 60;
const HEADING_EASE = 0.25;
const ZOOM_EASE = 0.3;

/** Closer view when slow, wider when fast, linear in between. */
export function zoomForSpeed(speedKmh: number | undefined): number {
  const s = speedKmh ?? 0;
  if (s <= SPEED_SLOW_KMH) return ZOOM_SLOW;
  if (s >= SPEED_FAST_KMH) return ZOOM_FAST;
  const t = (s - SPEED_SLOW_KMH) / (SPEED_FAST_KMH - SPEED_SLOW_KMH);
  return ZOOM_SLOW - t * (ZOOM_SLOW - ZOOM_FAST);
}

/** Ease `prev` toward `target` along the shortest angular path (handles 0/360 wrap). */
export function smoothHeading(prev: number, target: number, factor: number = HEADING_EASE): number {
  const diff = ((target - prev + 540) % 360) - 180; // shortest signed delta, -180..180
  return (prev + diff * factor + 360) % 360;
}

/**
 * Compute the next follow camera from the previous camera state and a GPS fix.
 * Returns null when the fix is too inaccurate to move the camera on. Heading is
 * frozen (kept at prev) when the vehicle is slow or GPS gives no heading.
 */
export function nextFollowCamera(
  prev: CameraState,
  fix: FollowFix,
): { camera: FollowCamera; state: CameraState } | null {
  if (fix.accuracyM != null && fix.accuracyM > MAX_ACCURACY_M) return null;

  const headingUsable =
    fix.headingDeg != null &&
    fix.headingDeg >= 0 &&
    (fix.speedKmh == null || fix.speedKmh >= MIN_SPEED_FOR_HEADING_KMH);

  const heading = headingUsable ? smoothHeading(prev.heading, fix.headingDeg as number) : prev.heading;
  const zoom = prev.zoom + (zoomForSpeed(fix.speedKmh) - prev.zoom) * ZOOM_EASE;

  return {
    camera: {
      center: { latitude: fix.latitude, longitude: fix.longitude },
      heading,
      pitch: PITCH_DEG,
      zoom,
    },
    state: { heading, zoom },
  };
}

export const FOLLOW_DEFAULT_ZOOM = 17;
