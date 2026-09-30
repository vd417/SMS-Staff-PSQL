import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
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

export const LiveMapView = forwardRef<LiveMapHandle, LiveMapViewProps>(({ stops, liveMarker, onMapReady, routeGeometry, onUserPan }, ref) => {
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(ref, () => ({
    animateToRegion: (region, duration) => mapRef.current?.animateToRegion(region, duration),
    fitToCoordinates: (coordinates, options) => mapRef.current?.fitToCoordinates(coordinates, options),
    animateCamera: (camera, options) => mapRef.current?.animateCamera(camera, options),
  }), []);

  const coords = toMapCoords(stops);
  const initial = coords[0] ?? { latitude: 0, longitude: 0 };
  const roles = stopRoles(stops, liveMarker ?? null);
  const segments = routeSegments(stops);
  const roadPath = routeGeometry?.status === 'available' && routeGeometry.geometry
    ? decodePolyline(routeGeometry.geometry)
    : null;

  return (
    <View style={styles.container}>
      <MapView
        testID="live-map"
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        onMapReady={onMapReady}
        onPanDrag={onUserPan}
        initialRegion={{ ...initial, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      >
        {roadPath && roadPath.length > 1 && (
          <Polyline testID="map-polyline" coordinates={roadPath} strokeWidth={6} strokeColor={colors.primary} />
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
        {liveMarker && (
          <Marker testID="map-live-marker" coordinate={liveMarker} anchor={{ x: 0.5, y: 0.5 }}>
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
});
