import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { useTheme } from '@/theme';
import { IconBtn, Btn, Pill, Skeleton, useToast } from '@/components/ui';
import { ErrorState } from '@/components/state';
import { TextScale } from '@/theme/typography';
import { useTripAssignment, useCurrentTrip, useRoster, useBoarding, useTripStops, useStopActions } from '@/features/trip/hooks';
import { useRouteGeometry } from '@/features/trip/useRouteGeometry';
import { useStopProgress } from '@/features/trip/useStopProgress';
import { stopActionMessage } from '@/features/trip/stopActionMessage';
import { useResumeBroadcast } from '@/features/trip/useResumeBroadcast';
import type { StopAction } from '@/features/trip/stopProgress';
import { LiveMapView } from '@/features/map/LiveMapView';
import { toMapCoords } from '@/features/map/toMapCoords';
import { distanceMeters } from '@/lib/geo';
import type { LiveMapHandle } from '@/features/map/liveMapTypes';
import type { BoardingState } from '@/data/domain';

type LiveMarker = { latitude: number; longitude: number; headingDeg?: number; speedKmh?: number; accuracyM?: number };
type GpsStatus = 'live' | 'delayed' | 'offline';

const NEXT: Record<BoardingState, BoardingState> = { boarded: 'dropped', dropped: 'absent', absent: 'boarded' };

function gpsStatusFor(secondsSinceUpdate: number | null): GpsStatus {
  if (secondsSinceUpdate == null) return 'offline';
  if (secondsSinceUpdate <= 15) return 'live';
  if (secondsSinceUpdate <= 60) return 'delayed';
  return 'offline';
}

export const LiveMapScreen = ({ navigation, route }: { navigation: any; route: { params: { tripId: string } } }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const assignment = useTripAssignment();
  const current = useCurrentTrip();
  useResumeBroadcast(current.data, () => toast.show(t('trip.resumeFailed'), 'error'));
  const tripId = route.params.tripId;
  const roster = useRoster(tripId);
  const boarding = useBoarding(tripId);
  const tripActive = current.data?.status === 'live' || current.data?.status === 'arrived';
  const tripStops = useTripStops(tripId, tripActive);
  const stopAction = useStopActions(tripId);
  const [stopError, setStopError] = useState<string | null>(null);
  const geometry = useRouteGeometry(assignment.data?.route.id);
  const mapRef = useRef<LiveMapHandle>(null);
  const hasFitRef = useRef(false);
  const [liveMarker, setLiveMarker] = useState<LiveMarker | null>(null);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showStudents, setShowStudents] = useState(false);
  const [justCompletedStopName, setJustCompletedStopName] = useState<string | null>(null);
  const [bottomCardHeight, setBottomCardHeight] = useState(0);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        toast.show(t('trip.locationDenied'), 'error');
        return;
      }
      try {
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
          (loc) => {
            if (!cancelled) {
              setLiveMarker({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                headingDeg: loc.coords.heading != null && loc.coords.heading >= 0 ? loc.coords.heading : undefined,
                speedKmh: loc.coords.speed != null && loc.coords.speed >= 0 ? Math.round(loc.coords.speed * 3.6) : undefined,
                accuracyM: loc.coords.accuracy != null ? Math.round(loc.coords.accuracy) : undefined,
              });
              setLastPingAt(Date.now());
            }
          }
        );
        if (cancelled) {
          sub.remove();
        } else {
          subscription = sub;
        }
      } catch {
        // GPS unavailable — leave liveMarker null, route/stops still render.
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const secondsSinceUpdate = lastPingAt != null ? Math.max(0, Math.floor((now - lastPingAt) / 1000)) : null;
  const gpsStatus = gpsStatusFor(secondsSinceUpdate);
  const statusColor = gpsStatus === 'live' ? colors.success : gpsStatus === 'delayed' ? colors.warn : colors.danger;
  const statusBg = gpsStatus === 'live' ? colors.successSoft : gpsStatus === 'delayed' ? colors.warnSoft : colors.dangerSoft;
  const statusLabel = t(`trip.${gpsStatus === 'live' ? 'live' : gpsStatus}`);

  const stops = useMemo(() => assignment.data?.route.stops ?? [], [assignment.data]);
  const progress = useStopProgress(stops, tripStops.data, roster.data ?? [], boarding.data ?? []);
  const activeStop = progress.activeStop;
  const stopStudents = useMemo(
    () => (activeStop ? roster.data?.filter((s) => s.stopId === activeStop.id) ?? [] : []),
    [activeStop, roster.data]
  );

  const distanceM = useMemo(
    () => (activeStop && liveMarker ? distanceMeters({ lat: liveMarker.latitude, lng: liveMarker.longitude }, { lat: activeStop.lat, lng: activeStop.lng }) : null),
    [activeStop, liveMarker]
  );
  const distanceLabel =
    distanceM == null
      ? null
      : distanceM >= 1000
        ? t('trip.distanceKm', { km: (distanceM / 1000).toFixed(1) })
        : t('trip.distanceM', { m: Math.round(distanceM) });
  const etaMin =
    distanceM != null && liveMarker?.speedKmh ? Math.round(distanceM / 1000 / liveMarker.speedKmh * 60) : null;

  const stateFor = (studentId: string): BoardingState =>
    boarding.data?.find((b) => b.studentId === studentId)?.state ?? 'absent';

  // Fit the map once it has finished loading (the underlying Google Maps script
  // resolves asynchronously on web — calling map methods any earlier throws).
  useEffect(() => {
    if (hasFitRef.current || !mapReady || stops.length === 0) return;
    hasFitRef.current = true;
    const coords = toMapCoords(stops);
    mapRef.current?.fitToCoordinates(liveMarker ? [...coords, liveMarker] : coords, {
      edgePadding: { top: 100, right: 60, bottom: bottomCardHeight + 60, left: 60 },
      animated: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, mapReady]);

  const onRecenter = () => {
    if (!liveMarker || !mapReady) return;
    mapRef.current?.animateToRegion(
      { latitude: liveMarker.latitude, longitude: liveMarker.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      500
    );
  };

  const runStopAction = (action: StopAction, onDone?: () => void) => {
    setStopError(null);
    stopAction.mutate(action, {
      onSuccess: () => onDone?.(),
      onError: (e) => setStopError(stopActionMessage(e, t)),
    });
  };

  const onMarkPickedUp = () => {
    if (!activeStop) return;
    // Records boarding only — departing the stop is a separate, explicit Depart stop tap.
    stopStudents.forEach((s) => {
      const hasRecord = boarding.data?.some((b) => b.studentId === s.id);
      if (!hasRecord) {
        boarding.setBoarding.mutate({ tripId, studentId: s.id, stopId: s.stopId, state: 'boarded', at: new Date().toISOString() });
      }
    });
  };

  const onDepart = () => {
    if (!activeStop) return;
    const name = activeStop.name;
    runStopAction({ kind: 'depart', stopId: activeStop.id }, () => {
      setJustCompletedStopName(name);
      setTimeout(() => setJustCompletedStopName(null), 1200);
    });
  };
  const pending = stopAction.isPending || tripStops.isLoading;

  const onNavigate = () => {
    if (!activeStop) return;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${activeStop.lat},${activeStop.lng}`).catch(() =>
      toast.show(t('common.somethingWrong'), 'error')
    );
  };

  return (
    <View style={styles.fill}>
      <View style={styles.map}>
        {assignment.isLoading || current.isLoading ? (
          <Skeleton width="100%" radius={0} style={styles.map} />
        ) : assignment.isError ? (
          <ErrorState onRetry={assignment.refetch} />
        ) : (
          <LiveMapView ref={mapRef} stops={stops} liveMarker={liveMarker} onMapReady={() => setMapReady(true)} routeGeometry={geometry.data} />
        )}
      </View>

      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, ...colors.shadow }]}>
        <View style={styles.headerRow}>
          <IconBtn icon="back" label={t('common.back')} onPress={() => navigation.goBack()} />
          <View style={styles.headerTitles}>
            <View style={styles.headerTitleRow}>
              <Text style={[TextScale.cardTitle, { color: colors.ink }]} numberOfLines={1}>
                {current.data?.busNo ?? assignment.data?.busNo}
              </Text>
              {current.data?.direction && (
                <Text style={[TextScale.caption, { color: colors.inkSoft }]}>
                  {' · '}
                  {t(`trip.dir.${current.data.direction}`)}
                </Text>
              )}
            </View>
            {assignment.data && (
              <Text style={[TextScale.caption, { color: colors.inkSoft }]} numberOfLines={1}>
                {assignment.data.route.name}
              </Text>
            )}
          </View>
          <Pill testID="gps-status-pill" label={statusLabel} color={statusColor} bg={statusBg} />
        </View>
      </View>

      <View
        style={[
          styles.recenterBtn,
          { bottom: bottomCardHeight + insets.bottom + 16, backgroundColor: colors.surface, ...colors.shadow },
        ]}
      >
        <IconBtn testID="recenter-btn" icon="location" label={t('trip.recenter')} onPress={onRecenter} color={colors.primary} />
      </View>

      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + 12, backgroundColor: colors.surface, ...colors.shadowLg }]}
        onLayout={(e) => setBottomCardHeight(e.nativeEvent.layout.height)}
      >
        {justCompletedStopName && (
          <Text testID="stop-completed-confirm" style={[TextScale.caption, { color: colors.success }]}>
            {t('trip.stopCompletedConfirm', { name: justCompletedStopName })}
          </Text>
        )}
        <View style={styles.statusRow}>
          <Pill testID="gps-status-pill-bottom" label={statusLabel} color={statusColor} bg={statusBg} />
          {liveMarker?.speedKmh != null && (
            <Text testID="live-speed" style={[TextScale.caption, { color: colors.inkSoft }]}>
              {`${liveMarker.speedKmh} km/h`}
            </Text>
          )}
          {liveMarker?.accuracyM != null && (
            <Text testID="live-accuracy" style={[TextScale.caption, { color: colors.inkSoft }]}>
              {`±${liveMarker.accuracyM} m`}
            </Text>
          )}
          {secondsSinceUpdate != null && (
            <Text testID="live-last-update" style={[TextScale.caption, { color: colors.inkSoft }]}>
              {t('trip.lastUpdate', { s: secondsSinceUpdate })}
            </Text>
          )}
        </View>

        {activeStop && (
          <View style={styles.nextStopCard}>
            <View style={styles.nextStopHead}>
              <View style={styles.nextStopInfo}>
                <Text style={[TextScale.caption, { color: colors.inkSoft }]}>
                  {progress.state === 'PICKUP_IN_PROGRESS' ? t('trip.stopArrived') : t('trip.nextStop')}
                </Text>
                <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{activeStop.name}</Text>
                <Text style={[TextScale.caption, { color: colors.inkSoft }]}>
                  {t('trip.studentsExpected', { count: stopStudents.length })}
                  {distanceLabel ? ` · ${distanceLabel}` : ''}
                  {etaMin != null ? ` · ${t('trip.etaMin', { min: etaMin })}` : ''}
                </Text>
              </View>
              <IconBtn testID="navigate-btn" icon="location" label={t('trip.navigate')} onPress={onNavigate} color={colors.primary} />
            </View>
            {progress.state === 'EN_ROUTE' && (
              <Btn
                testID="arrived-btn"
                label={t('trip.arrived')}
                icon="location"
                onPress={() => activeStop && runStopAction({ kind: 'arrive', stopId: activeStop.id })}
                loading={stopAction.isPending && stopAction.variables?.kind === 'arrive'}
                disabled={pending}
                style={styles.markPickedUpBtn}
              />
            )}
            {progress.state === 'PICKUP_IN_PROGRESS' && (
              <>
                <Text testID="pickup-progress-summary" style={[TextScale.caption, { color: colors.inkSoft, marginTop: 8 }]}>
                  {t('home.studentsAssigned', { n: progress.assignedCount })}
                  {' · '}
                  {t('trip.pickedUpCount', { n: progress.pickedUpCount })}
                  {' · '}
                  {t('trip.remainingCount', { n: progress.remainingCount })}
                </Text>
                <Btn
                  testID="mark-picked-up-btn"
                  label={t('trip.markPickedUp')}
                  icon="check"
                  onPress={onMarkPickedUp}
                  style={styles.markPickedUpBtn}
                />
                <Btn
                  testID="depart-stop-btn"
                  label={t('trip.departStop')}
                  icon="route"
                  variant="ghost"
                  onPress={onDepart}
                  loading={stopAction.isPending && stopAction.variables?.kind === 'depart'}
                  disabled={pending || !progress.canDepart}
                  style={styles.markPickedUpBtn}
                />
                {!progress.canDepart && (
                  <Text testID="depart-hint" style={[TextScale.caption, { color: colors.inkSoft, marginTop: 4 }]}>
                    {t('trip.departHint')}
                  </Text>
                )}
              </>
            )}
            <Pressable
              testID="view-students-btn"
              onPress={() => setShowStudents((v) => !v)}
              style={[styles.viewStudentsBtn, { borderColor: colors.primary }]}
            >
              <Text style={[TextScale.button, { color: colors.primary }]}>{t('trip.viewStudents')}</Text>
            </Pressable>
            {showStudents && (
              <View style={styles.studentList}>
                {stopStudents.map((s) => {
                  const st = stateFor(s.id);
                  const color = st === 'boarded' ? colors.success : st === 'dropped' ? colors.inkSoft : colors.danger;
                  return (
                    <Pressable
                      key={s.id}
                      testID={`stop-student-${s.id}`}
                      onPress={() =>
                        boarding.setBoarding.mutate({ tripId, studentId: s.id, stopId: s.stopId, state: NEXT[st], at: new Date().toISOString() })
                      }
                      style={[styles.studentRow, { borderColor: colors.sunken }]}
                    >
                      <Text style={[TextScale.body, { color: colors.ink, flex: 1 }]}>{s.name}</Text>
                      <Text style={[TextScale.caption, { color }]}>{t(`trip.boarding.${st}`)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}
        {progress.state === 'ROUTE_COMPLETED' && stops.length > 0 && (
          <View style={styles.nextStopCard}>
            <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{t('trip.routeCompleteTitle')}</Text>
            {current.data?.direction === 'pickup' && !progress.schoolArrived ? (
              <Btn
                testID="school-arrived-btn"
                label={t('trip.schoolArrived')}
                icon="check"
                onPress={() => runStopAction({ kind: 'school' })}
                loading={stopAction.isPending}
                disabled={pending}
                style={styles.markPickedUpBtn}
              />
            ) : (
              <>
                <Text style={[TextScale.caption, { color: colors.inkSoft, marginTop: 4 }]}>{t('trip.endFromTripHint')}</Text>
                <Btn
                  testID="back-to-trip-btn"
                  label={t('trip.backToTrip')}
                  variant="ghost"
                  onPress={() => navigation.goBack()}
                  style={styles.markPickedUpBtn}
                />
              </>
            )}
          </View>
        )}
        {stopError && (
          <Text testID="stop-action-error" style={[TextScale.caption, { color: colors.danger }]}>{stopError}</Text>
        )}
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
  headerTitleRow: { flexDirection: 'row', alignItems: 'baseline' },
  recenterBtn: { position: 'absolute', right: 16, borderRadius: 100 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  nextStopCard: {},
  nextStopHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  nextStopInfo: { flex: 1, gap: 2 },
  viewStudentsBtn: { marginTop: 10, borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  markPickedUpBtn: { marginTop: 10 },
  studentList: { marginTop: 8 },
  studentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1 },
});
