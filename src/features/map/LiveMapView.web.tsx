import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from '@teovilla/react-native-web-maps';
import type RNMapView from 'react-native-maps';
import { useTheme } from '@/theme';
import { toMapCoords } from './toMapCoords';
import { decodePolyline } from '@/lib/decodePolyline';
import { BusMarker } from './BusMarker';
import { StopMarker } from './StopMarker';
import { RouteSegmentLabel } from './RouteSegmentLabel';
import { RouteUnavailableBadge } from './RouteUnavailableBadge';
import { stopRoles } from './stopRoles';
import { routeSegments } from './routeSegments';
import type { LiveMapViewProps, LiveMapHandle } from './liveMapTypes';

export type { LiveMapViewProps, LiveMapHandle };

// Approximate Google-style zoom level -> region delta, for the web fallback when
// the wrapper can't apply a tilted/heading camera and we recenter instead.
const zoomToDelta = (zoom: number | undefined): number => 360 / Math.pow(2, zoom ?? 17);

export const LiveMapView = forwardRef<LiveMapHandle, LiveMapViewProps>(({ stops, liveMarker, onMapReady, routeGeometry, onUserPan }, ref) => {
  const { colors } = useTheme();
  const mapRef = useRef<Partial<RNMapView>>(null);
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
  }), []);

  const coords = toMapCoords(stops);
  const initial = coords[0] ?? { latitude: 0, longitude: 0 };
  const roles = stopRoles(stops, liveMarker ?? null);
  const segments = routeSegments(stops);
  const roadPath = routeGeometry?.status === 'available' && routeGeometry.geometry
    ? decodePolyline(routeGeometry.geometry)
    : null;

  if (!apiKey) {
    return (
      <View testID="map-unavailable" style={styles.fallback}>
        <Text style={styles.fallbackText}>Map unavailable</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
        {roadPath && roadPath.length > 1 && (
          <Polyline testID="map-polyline" coordinates={roadPath} strokeWidth={6} strokeColor={colors.primary} />
        )}
        {segments.map((seg, i) => (
          <Marker key={`seg-${i}`} testID={`map-segment-${i}`} coordinate={seg.midpoint}>
            <RouteSegmentLabel distanceKm={seg.distanceKm} durationMin={seg.durationMin} />
          </Marker>
        ))}
        {roles.map(({ stop, role, isDestination }) => (
          <Marker key={stop.id} testID={`map-stop-${stop.id}`} coordinate={{ latitude: stop.lat, longitude: stop.lng }} title={stop.name}>
            <StopMarker role={role} isDestination={isDestination} />
          </Marker>
        ))}
        {liveMarker && (
          <Marker testID="map-live-marker" coordinate={liveMarker}>
            <BusMarker headingDeg={liveMarker.headingDeg} />
          </Marker>
        )}
      </MapView>
      {routeGeometry?.status === 'unavailable' && <RouteUnavailableBadge />}
    </View>
  );
});
LiveMapView.displayName = 'LiveMapView';

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  fallbackText: { fontSize: 14, color: '#666' },
});
