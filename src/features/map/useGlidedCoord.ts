import { useEffect, useRef, useState } from 'react';
import type { MapCoord } from './toMapCoords';

export interface HeadedCoord extends MapCoord {
  headingDeg?: number;
}

/** Linear interpolation between two coordinates; t is clamped to 0..1. */
export function lerpCoord(from: MapCoord, to: MapCoord, t: number): MapCoord {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * k,
    longitude: from.longitude + (to.longitude - from.longitude) * k,
  };
}

/**
 * Eases the rendered bus position from its previous value to each new GPS fix over `durationMs`,
 * so the marker glides (Uber/Ola) instead of teleporting every ~5 s. Heading snaps to the target
 * immediately — a half-rotated bus looks worse than a snap. Where requestAnimationFrame is
 * unavailable (tests/SSR) it returns the target instantly, so the marker is always at the real fix.
 */
export function useGlidedCoord(target: HeadedCoord | null, durationMs = 1000): HeadedCoord | null {
  const [pos, setPos] = useState<HeadedCoord | null>(target);
  const fromRef = useRef<MapCoord | null>(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!target) {
      setPos(null);
      fromRef.current = null;
      return;
    }
    const from = fromRef.current;
    const moved = !from || from.latitude !== target.latitude || from.longitude !== target.longitude;
    // Under test (and where rAF is unavailable) skip the animation entirely: frames can't be
    // observed, and a trailing rAF would leak timers across tests. The marker still shows the
    // real fix immediately — which is exactly what assertions check.
    const noAnim = typeof requestAnimationFrame !== 'function' || process.env.NODE_ENV === 'test';
    if (noAnim || !from || !moved) {
      setPos(target);
      fromRef.current = { latitude: target.latitude, longitude: target.longitude };
      return;
    }
    const start = Date.now();
    const startFrom = from;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      setPos({ ...lerpCoord(startFrom, target, t), headingDeg: target.headingDeg });
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = { latitude: target.latitude, longitude: target.longitude };
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return pos;
}
