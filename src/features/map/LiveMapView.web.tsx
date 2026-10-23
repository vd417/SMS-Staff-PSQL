import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from '@teovilla/react-native-web-maps';
import type RNMapView from 'react-native-maps';
import { useTheme } from '@/theme';
import { toMapCoords, isFiniteCoord } from './toMapCoords';
import { decodePolyline } from '@/lib/decodePolyline';
import { BusMarker } from './BusMarker';
import { StopMarker } from './StopMarker';
import { RouteSegmentLabel } from './RouteSegmentLabel';
import { RouteUnavailableBadge } from './RouteUnavailableBadge';
import { MapErrorBoundary } from './MapErrorBoundary';
import { stopRoles } from './stopRoles';
import { routeSegments } from './routeSegments';
import { pathToNearestStop, splitRouteProgress } from './routeProgress';
import { useGlidedCoord } from './useGlidedCoord';
import type { LiveMapViewProps, LiveMapHandle } from './liveMapTypes';

export type { LiveMapViewProps, LiveMapHandle };

// Approximate Google-style zoom level -> region delta, for the web fallback when
// the wrapper can't apply a tilted/heading camera and we recenter instead.
const zoomToDelta = (zoom: number | undefined): number => 360 / Math.pow(2, zoom ?? 17);

export const LiveMapView = forwardRef<LiveMapHandle, LiveMapViewProps>(({ stops, liveMarker, onMapReady, routeGeometry, onUserPan }, ref) => {
  const { colors } = useTheme();
  const mapRef = useRef<Partial<RNMapView>>(null);
  const containerRef = useRef<unknown>(null);
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  // Optional Cloud-based Map ID (enables vector maps / cloud styling). Undefined
  // is fine — the map falls back to the default raster style.
  const mapId = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined;

  useImperativeHandle(ref, () => ({
    animateToRegion: (region, duration) => mapRef.current?.animateToRegion?.(region, duration),
    fitToCoordinates: (coordinates, options) => mapRef.current?.fitToCoordinates?.(coordinates, options),
    animateCamera: (camera, options) => {
      const map = mapRef.current;
      if (typeof map?.animateCamera === 'function') {
        map.animateCamera(camera as never, options as never);
        return;
      }
      // Graceful follow-only fallback: recenter (no tilt/heading) when the web
      // wrapper doesn't implement animateCamera.
      const delta = zoomToDelta(camera.zoom);
      map?.animateToRegion?.(
        { ...camera.center, latitudeDelta: delta, longitudeDelta: delta },
        options?.duration ?? 500,
      );
    },
    zoomBy: async (delta) => {
      const map = mapRef.current as { getCamera?: () => Promise<{ zoom?: number }>; animateCamera?: (c: unknown, o?: unknown) => void } | null;
      try {
        const cam = await map?.getCamera?.();
        if (cam && typeof cam.zoom === 'number') {
          map?.animateCamera?.({ ...cam, zoom: cam.zoom + delta }, { duration: 200 });
        }
      } catch {
        // Zoom not supported by this web map wrapper — the built-in Google +/- controls remain.
      }
    },
  }), []);

  // A null/NaN coordinate flows straight into the DOM overlay position on web (no native guard),
  // so filter at this boundary exactly like the native view does.
  const safeStops = stops.filter((s) => isFiniteCoord(s.lat, s.lng));
  const safeLive = liveMarker && isFiniteCoord(liveMarker.latitude, liveMarker.longitude) ? liveMarker : null;
  const coords = toMapCoords(safeStops);
  const initial = coords[0] ?? { latitude: 0, longitude: 0 };
  const segments = routeSegments(safeStops);
  const roadPath = useMemo(
    () => (routeGeometry?.status === 'available' && routeGeometry.geometry ? decodePolyline(routeGeometry.geometry) : null),
    [routeGeometry?.status, routeGeometry?.geometry],
  );
  const line = roadPath && roadPath.length > 1 ? roadPath : coords.length > 1 ? coords : null;
  // Same highlight as native: casing plus the road ahead. Off the route, `ahead` is the whole line.
  const route = line && line.length > 1 ? splitRouteProgress(line, safeLive) : null;
  const offRoute = route?.offRoute ?? false;
  const roles = stopRoles(safeStops, safeLive, { offRoute });
  const toNearestStop = pathToNearestStop(line ?? coords, safeLive, coords);
  const glidedLive = useGlidedCoord(safeLive);

  // teovilla only forwards onPanDrag for map DRAG, so a scroll-wheel zoom wouldn't drop follow
  // mode and the next fix would snap the zoom back. Listen for wheel on the container (web only;
  // the ref is a DOM node there, and a no-op elsewhere) to suspend following on manual zoom.
  useEffect(() => {
    const node = containerRef.current as { addEventListener?: Function; removeEventListener?: Function } | null;
    if (!node || typeof node.addEventListener !== 'function' || !onUserPan) return;
    const handler = () => onUserPan();
    node.addEventListener('wheel', handler, { passive: true });
    return () => node.removeEventListener?.('wheel', handler);
  }, [onUserPan]);

  if (!apiKey) {
    return (
      <View testID="map-unavailable" style={styles.fallback}>
        <Text style={styles.fallbackText}>Map unavailable</Text>
      </View>
    );
  }

  return (
    <MapErrorBoundary fallback={() => (
      <View testID="map-unavailable" style={styles.fallback}>
        <Text style={styles.fallbackText}>Map unavailable</Text>
      </View>
    )}>
    <View ref={containerRef as never} style={styles.container}>
      <MapView
        testID="live-map"
        ref={mapRef}
        provider="google"
        style={styles.map}
        googleMapsApiKey={apiKey}
        googleMapsMapId={mapId}
        onMapReady={onMapReady}
        onPanDrag={onUserPan}
        initialRegion={{ ...initial, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      >
        {route && route.ahead.length > 1 && (
          <Polyline coordinates={route.ahead} strokeWidth={14} strokeColor="#FFFFFF" />
        )}
        {route && route.traveled.length > 1 && (
          <Polyline testID="map-polyline-traveled" coordinates={route.traveled} strokeWidth={8} strokeColor={colors.inkFaint} />
        )}
        {route && route.ahead.length > 1 && (
          <Polyline testID="map-polyline" coordinates={route.ahead} strokeWidth={8} strokeColor={colors.primary} />
        )}
        {toNearestStop.length > 1 && (
          <Polyline coordinates={toNearestStop} strokeWidth={14} strokeColor="#FFFFFF" />
        )}
        {toNearestStop.length > 1 && (
          <Polyline testID="map-polyline-to-stop" coordinates={toNearestStop} strokeWidth={8} strokeColor={colors.gold} />
        )}
        {segments.map((seg, i) => (
          <Marker key={`seg-${i}`} testID={`map-segment-${i}`} coordinate={seg.midpoint}>
            <RouteSegmentLabel distanceKm={seg.distanceKm} durationMin={seg.durationMin} />
          </Marker>
        ))}
        {roles.map(({ stop, role, isDestination, near }) => (
          <Marker key={stop.id} testID={`map-stop-${stop.id}`} coordinate={{ latitude: stop.lat, longitude: stop.lng }} title={stop.name} tracksViewChanges>
            <StopMarker role={role} isDestination={isDestination} near={near} name={stop.name} />
          </Marker>
        ))}
        {glidedLive && (
          <Marker testID="map-live-marker" coordinate={glidedLive} tracksViewChanges>
            <BusMarker headingDeg={glidedLive.headingDeg} offRoute={offRoute} />
          </Marker>
        )}
      </MapView>
      {routeGeometry?.status === 'unavailable' && <RouteUnavailableBadge />}
    </View>
    </MapErrorBoundary>
  );
});
LiveMapView.displayName = 'LiveMapView';

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  fallbackText: { fontSize: 14, color: '#666' },
});
