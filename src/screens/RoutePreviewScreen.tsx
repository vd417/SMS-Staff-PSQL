import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { IconBtn, Skeleton } from '@/components/ui';
import { ErrorState } from '@/components/state';
import { TextScale } from '@/theme/typography';
import { useTripAssignment } from '@/features/trip/hooks';
import { useRouteGeometry } from '@/features/trip/useRouteGeometry';
import { LiveMapView } from '@/features/map/LiveMapView';
import { toMapCoords } from '@/features/map/toMapCoords';
import type { LiveMapHandle } from '@/features/map/liveMapTypes';

export const RoutePreviewScreen = ({ navigation }: { navigation: any }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const assignment = useTripAssignment();
  const stops = useMemo(() => assignment.data?.route.stops ?? [], [assignment.data]);
  // Same Google Routes road geometry the live map uses, so the preview draws the
  // real road path (or the "unavailable" badge) instead of nothing.
  const geometry = useRouteGeometry(assignment.data?.route.id);

  const mapRef = useRef<LiveMapHandle>(null);
  const hasFitRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  // Frame the whole route once the map is ready. Without this the map keeps the
  // wide default region and shows a world view instead of the actual route. The
  // web Google Maps script resolves asynchronously, so fitting any earlier is a
  // no-op — hence the mapReady gate (mirrors LiveMapScreen).
  useEffect(() => {
    if (hasFitRef.current || !mapReady || stops.length === 0) return;
    hasFitRef.current = true;
    mapRef.current?.fitToCoordinates(toMapCoords(stops), {
      edgePadding: { top: 120, right: 60, bottom: 80, left: 60 },
      animated: false,
    });
  }, [stops, mapReady]);

  return (
    <View style={styles.fill}>
      <View style={styles.map}>
        {assignment.isLoading ? (
          <Skeleton width="100%" radius={0} style={styles.map} />
        ) : assignment.isError ? (
          <ErrorState onRetry={assignment.refetch} />
        ) : (
          <LiveMapView
            ref={mapRef}
            stops={stops}
            liveMarker={null}
            routeGeometry={geometry.data}
            onMapReady={() => setMapReady(true)}
          />
        )}
      </View>

      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, ...colors.shadow }]}>
        <View style={styles.headerRow}>
          <IconBtn icon="back" label={t('common.back')} onPress={() => navigation.goBack()} />
          <View style={styles.headerTitles}>
            <Text style={[TextScale.cardTitle, { color: colors.ink }]} numberOfLines={1}>
              {t('trip.viewRouteMap')}
            </Text>
            {assignment.data && (
              <Text style={[TextScale.caption, { color: colors.inkSoft }]} numberOfLines={1}>
                {assignment.data.route.name}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitles: { flex: 1 },
});
