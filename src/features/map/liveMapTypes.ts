import type { Stop, RouteGeometry } from '@/data/domain';

export interface LiveMarker {
  latitude: number;
  longitude: number;
  headingDeg?: number;
}

export interface LiveMapViewProps {
  stops: Stop[];
  liveMarker?: LiveMarker | null;
  onMapReady?: () => void;
  routeGeometry?: RouteGeometry | null;
  /** Fired when the driver pans/drags/zooms the map by hand, so the screen can
   *  drop out of follow mode. Not fired by programmatic camera moves. */
  onUserPan?: () => void;
}

export interface MapCamera {
  center: { latitude: number; longitude: number };
  heading?: number;
  pitch?: number;
  zoom?: number;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MapEdgePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LiveMapHandle {
  animateToRegion: (region: MapRegion, duration?: number) => void;
  fitToCoordinates: (
    coordinates: { latitude: number; longitude: number }[],
    options?: { edgePadding?: MapEdgePadding; animated?: boolean }
  ) => void;
  /** Uber/Ola-style camera move (center + bearing + tilt + zoom). On web, tilt/
   *  heading degrade gracefully to a recenter when the wrapper can't apply them. */
  animateCamera: (camera: MapCamera, options?: { duration?: number }) => void;
}
