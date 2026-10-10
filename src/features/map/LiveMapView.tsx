import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { Btn } from '@/components/ui';
import { TextScale } from '@/theme/typography';
import { toMapCoords, isFiniteCoord, type MapCoord } from './toMapCoords';
import { decodePolyline } from '@/lib/decodePolyline';
import { BusMarker } from './BusMarker';
import { StopMarker } from './StopMarker';
import { RouteSegmentLabel } from './RouteSegmentLabel';
import { RouteUnavailableBadge } from './RouteUnavailableBadge';
import { MapErrorBoundary } from './MapErrorBoundary';
import { stopRoles } from './stopRoles';
import { routeSegments } from './routeSegments';
import { splitRouteProgress } from './routeProgress';
import { useGlidedCoord } from './useGlidedCoord';
import type { LiveMapViewProps, LiveMapHandle } from './liveMapTypes';

export type { LiveMapViewProps, LiveMapHandle };

/** Shown when the map fails to render — keeps the app alive and offers Google Maps. */
const MapFallback: React.FC<{ retry: () => void; destination?: MapCoord }> = ({ retry, destination }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const openGoogleMaps = () => {
    const url = destination
      ? `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}`
      : 'https://www.google.com/maps';
    Linking.openURL(url).catch(() => {});
  };
  return (
    <View testID="map-fallback" style={[styles.fallback, { backgroundColor: colors.surface }]}>
      <Text style={[TextScale.cardTitle, { color: colors.ink, textAlign: 'center' }]}>{t('trip.mapUnavailable')}</Text>
      <Text style={[TextScale.caption, { color: colors.inkSoft, textAlign: 'center' }]}>{t('trip.mapUnavailableHint')}</Text>
      <Btn testID="map-open-google" label={t('trip.openInGoogleMaps')} icon="route" onPress={openGoogleMaps} />
      <Btn testID="map-retry" label={t('trip.retryMap')} variant="ghost" onPress={retry} />
    </View>
  );
};

export const LiveMapView = forwardRef<LiveMapHandle, LiveMapViewProps>(({ stops, liveMarker, onMapReady, routeGeometry, onUserPan }, ref) => {
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(ref, () => ({
    animateToRegion: (region, duration) => mapRef.current?.animateToRegion(region, duration),
    fitToCoordinates: (coordinates, options) => mapRef.current?.fitToCoordinates(coordinates, options),
    animateCamera: (camera, options) => mapRef.current?.animateCamera(camera, options),
    zoomBy: async (delta) => {
      const cam = await mapRef.current?.getCamera();
      if (cam && typeof cam.zoom === 'number') {
        mapRef.current?.animateCamera({ ...cam, zoom: cam.zoom + delta }, { duration: 200 });
      }
    },
  }), []);

  // Drop any stop/live marker with a null/NaN coordinate before it reaches a native
  // Marker — a non-finite lat/lng is a classic native map-marker crash.
  const safeStops = stops.filter((s) => isFiniteCoord(s.lat, s.lng));
  const safeLive = liveMarker && isFiniteCoord(liveMarker.latitude, liveMarker.longitude) ? liveMarker : null;
  const coords = toMapCoords(safeStops);
  const initial = coords[0] ?? { latitude: 0, longitude: 0 };
  const roles = stopRoles(safeStops, safeLive);
  const segments = routeSegments(safeStops);
  // Decode once per geometry change, not on every GPS/glide re-render.
  const roadPath = useMemo(
    () => (routeGeometry?.status === 'available' && routeGeometry.geometry ? decodePolyline(routeGeometry.geometry) : null),
    [routeGeometry?.status, routeGeometry?.geometry],
  );
  // Uber/Ola-style progress: dim the road already passed, highlight what's ahead. Split at the
  // point nearest the bus; with no fix the whole route stays "ahead" (highlighted).
  const route = roadPath && roadPath.length > 1 ? splitRouteProgress(roadPath, safeLive) : null;
  // Glide the marker between the ~5 s fixes instead of letting it teleport.
  const glidedLive = useGlidedCoord(safeLive);

  const destination = coords[coords.length - 1];

  return (
    <View style={styles.container}>
      <MapErrorBoundary fallback={(retry) => <MapFallback retry={retry} destination={destination} />}>
      <MapView
        testID="live-map"
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        onMapReady={onMapReady}
        onPanDrag={onUserPan}
        initialRegion={{ ...initial, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      >
        {route && route.ahead.length > 1 && (
          <Polyline coordinates={route.ahead} strokeWidth={11} strokeColor={colors.surface} lineCap="round" lineJoin="round" />
        )}
        {route && route.traveled.length > 1 && (
          <Polyline testID="map-polyline-traveled" coordinates={route.traveled} strokeWidth={6} strokeColor={colors.inkFaint} lineCap="round" lineJoin="round" />
        )}
        {route && route.ahead.length > 1 && (
          <Polyline testID="map-polyline" coordinates={route.ahead} strokeWidth={7} strokeColor={colors.primary} lineCap="round" lineJoin="round" />
        )}
        {segments.map((seg, i) => (
          <Marker key={`seg-${i}`} testID={`map-segment-${i}`} coordinate={seg.midpoint} anchor={{ x: 0.5, y: 0.5 }}>
            <RouteSegmentLabel distanceKm={seg.distanceKm} durationMin={seg.durationMin} />
          </Marker>
        ))}
        {roles.map(({ stop, role, isDestination }) => (
          <Marker
            key={stop.id}
            testID={`map-stop-${stop.id}`}
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            title={stop.name}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <StopMarker role={role} isDestination={isDestination} />
          </Marker>
        ))}
        {glidedLive && (
          <Marker testID="map-live-marker" coordinate={glidedLive} anchor={{ x: 0.5, y: 0.5 }}>
            <BusMarker headingDeg={glidedLive.headingDeg} />
          </Marker>
        )}
      </MapView>
      </MapErrorBoundary>
      {routeGeometry?.status === 'unavailable' && <RouteUnavailableBadge />}
    </View>
  );
});
LiveMapView.displayName = 'LiveMapView';

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
});
