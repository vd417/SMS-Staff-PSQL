import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { useRepositories } from '@/data/repositories/RepositoryContext';
import { IconBtn, Btn, Card, Pill, RouteStrip, Skeleton, useToast } from '@/components/ui';
import { Icon } from '@/components/icons';
import { ErrorState } from '@/components/state';
import { TextScale } from '@/theme/typography';
import {
  useTripAssignment, useCurrentTrip, useStartTrip, useEndTrip, useRoster, useBoarding, useTripStops,
} from '@/features/trip/hooks';
import { useVehicleInspections, useFuelLogs } from '@/features/vehicleChecks/hooks';
import { startBroadcast, stopBroadcast } from '@/features/trip/broadcaster';
import { routeTimelineFor } from '@/features/trip/stopProgress';
import { useResumeBroadcast } from '@/features/trip/useResumeBroadcast';
import { stopActionMessage } from '@/features/trip/stopActionMessage';
import { isAppError } from '@/lib/errors';
import type { TripDirection, TripSummary, BoardingState } from '@/data/domain';

const NEXT: Record<BoardingState, BoardingState> = { boarded: 'dropped', dropped: 'absent', absent: 'boarded' };

const ProgressBar: React.FC<{ testID: string; now: number; max: number; accent: string }> = ({ testID, now, max, accent }) => {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max, now }}
      style={[styles.progressTrack, { backgroundColor: colors.sunken }]}
    >
      <View style={[styles.progressFill, { backgroundColor: accent, width: max > 0 ? `${(now / max) * 100}%` : '0%' }]} />
    </View>
  );
};

const RosterPanel: React.FC<{ tripId: string; accent: string }> = ({ tripId, accent }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const roster = useRoster(tripId);
  const boarding = useBoarding(tripId);
  const stateFor = (studentId: string): BoardingState =>
    boarding.data?.find((b) => b.studentId === studentId)?.state ?? 'absent';
  const onBoard = roster.data?.filter((s) => stateFor(s.id) === 'boarded').length ?? 0;
  const total = roster.data?.length ?? 0;

  return (
    <Card>
      <View style={styles.rosterHead}>
        <Text style={[TextScale.cardTitle, { color: accent }]}>{t('trip.roster')}</Text>
        <Text testID="headcount" style={[TextScale.bodyStrong, { color: colors.ink }]}>{`${onBoard} / ${total}`}</Text>
      </View>
      <ProgressBar testID="roster-progress" now={onBoard} max={total} accent={accent} />
      {roster.data?.map((s) => {
        const st = stateFor(s.id);
        const color = st === 'boarded' ? colors.success : st === 'dropped' ? colors.inkSoft : colors.danger;
        return (
          <Pressable
            key={s.id}
            testID={`roster-${s.id}`}
            onPress={() => boarding.setBoarding.mutate({ tripId, studentId: s.id, stopId: s.stopId, state: NEXT[st], at: new Date().toISOString() })}
            style={[styles.rosterRow, { borderColor: colors.sunken }]}
          >
            <Text style={[TextScale.body, { color: colors.ink, flex: 1 }]}>{s.name}</Text>
            <Text style={[TextScale.caption, { color }]}>{t(`trip.boarding.${st}`)}</Text>
          </Pressable>
        );
      })}
    </Card>
  );
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

const VehicleCard: React.FC<{ busId: string; navigation: any }> = ({ busId, navigation }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const inspections = useVehicleInspections(busId);
  const fuelLogs = useFuelLogs(busId);
  const lastInspection = inspections.data?.[0];
  const lastFuelLog = fuelLogs.data?.[0];

  return (
    <Card>
      <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{t('trip.vehicle')}</Text>
      <Text testID="vehicle-last-inspection" style={[TextScale.body, { color: colors.inkSoft, marginTop: 8 }]}>
        {t('trip.lastInspection', { date: lastInspection ? formatDate(lastInspection.inspectionDate) : t('trip.noneYet') })}
      </Text>
      <Text testID="vehicle-last-fuel-entry" style={[TextScale.body, { color: colors.inkSoft, marginTop: 4 }]}>
        {t('trip.lastFuelEntry', { date: lastFuelLog ? formatDate(lastFuelLog.recordedAt) : t('trip.noneYet') })}
      </Text>
      <Btn
        testID="trip-vehicle-details"
        label={t('trip.vehicleDetails')}
        variant="ghost"
        onPress={() => navigation.navigate('VehicleCheck')}
        style={styles.cta}
      />
    </Card>
  );
};

export const TripScreen = ({ navigation }: { navigation: any }) => {
  const { t } = useTranslation();
  const { colors, role } = useTheme();
  const repos = useRepositories();
  const toast = useToast();
  const assignment = useTripAssignment();
  const current = useCurrentTrip();
  const startTrip = useStartTrip();
  const endTrip = useEndTrip();
  const [direction, setDirection] = useState<TripDirection>('pickup');
  const [summary, setSummary] = useState<TripSummary | null>(null);

  const accent = role.accent;
  const trip = current.data;
  const tripStops = useTripStops(trip?.id, !!trip);
  useResumeBroadcast(trip, () => toast.show(t('trip.resumeFailed'), 'error'));

  // Vehicle inspection + fuel log: reachable to transport staff whether a trip is
  // live or not, so the pre-trip and active-trip branches render the same section.
  const vehicleChecks =
    role.key === 'driver' || role.key === 'conductor' ? (
      <>
        {assignment.data && <VehicleCard busId={assignment.data.busId} navigation={navigation} />}
        <Card>
          <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{t('trip.safety')}</Text>
          <Text style={[TextScale.caption, { color: colors.inkSoft, marginTop: 4, marginBottom: 10 }]}>{t('trip.safetyHint')}</Text>
          <Btn
            testID="trip-vehicle-check"
            label={t('home.vehicleCheck')}
            icon="check"
            variant="ghost"
            onPress={() => navigation.navigate('VehicleCheck')}
          />
        </Card>
      </>
    ) : null;

  const onStart = async () => {
    if (!assignment.data) return;
    let started;
    try {
      started = await startTrip.mutateAsync({
        routeId: assignment.data.route.id, direction, busNo: assignment.data.busNo,
      });
    } catch (e) {
      // not_assigned / no_driver_assigned / bus_already_active — say why instead of failing silently.
      toast.show(stopActionMessage(e, t), 'error');
      return;
    }
    const ok = await startBroadcast({ tripId: started.id, onPings: (id, pings) => repos.trip.publishPings(id, pings) });
    if (!ok) {
      toast.show(t('trip.permissionDenied'), 'error');
      await endTrip.mutateAsync(started.id);
      return;
    }
    navigation.navigate('LiveMap', { tripId: started.id });
  };

  const onEnd = async () => {
    if (!trip) return;
    let s: TripSummary;
    try {
      // endTrip first: if it fails (offline), the trip stays live server-side and this phone
      // must keep broadcasting so it can still resume/retry — stopping first would clear the
      // persisted broadcast id and leave a live trip with no GPS. Any ping still in flight
      // between endTrip succeeding and stopBroadcast running is rejected 409 trip_ended and
      // dropped by the broadcaster's permanent-rejection guard, not retried.
      s = await endTrip.mutateAsync(trip.id);
    } catch (e) {
      toast.show(stopActionMessage(e, t), 'error');
      return;
    }
    await stopBroadcast().catch(() => {});
    setSummary(s);
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <IconBtn icon="back" label={t('common.back')} onPress={() => navigation.goBack()} />
        <Text style={[TextScale.screenTitle, { color: colors.ink }]}>{t('trip.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {assignment.isLoading || current.isLoading ? (
          <Skeleton width="100%" height={160} radius={16} />
        ) : assignment.isError && isAppError(assignment.error) && assignment.error.code === 'not_found' ? (
          <Card>
            <View style={styles.noRoute}>
              <Icon name="route" size={32} color={colors.inkFaint} />
              <Text style={[TextScale.cardTitle, { color: colors.ink, textAlign: 'center' }]}>{t('trip.noRouteAssigned')}</Text>
              <Text style={[TextScale.caption, { color: colors.inkSoft, textAlign: 'center' }]}>{t('trip.noRouteAssignedHint')}</Text>
            </View>
          </Card>
        ) : assignment.isError ? (
          <ErrorState onRetry={assignment.refetch} />
        ) : summary ? (
          <Card>
            <Text style={[TextScale.cardTitle, { color: accent }]}>{t('trip.summaryTitle')}</Text>
            <Text style={[TextScale.body, { color: colors.ink, marginTop: 8 }]}>
              {t('trip.summaryLine', { min: summary.durationMin, km: summary.distanceKm, stops: summary.stopsCovered })}
            </Text>
            <Btn label={t('common.done')} onPress={() => navigation.goBack()} accent={accent} style={styles.cta} />
          </Card>
        ) : trip ? (
          <>
            <View style={[styles.banner, { backgroundColor: accent }]}>
              <Text style={[TextScale.bodyStrong, { color: '#FFFFFF' }]}>{t('trip.broadcasting')}</Text>
            </View>
            {assignment.data && (
              <RouteStrip
                stops={routeTimelineFor(assignment.data.route.stops, tripStops.data)}
                accent={accent}
              />
            )}
            <Card>
              <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t('trip.bus')}</Text>
              <Text style={[TextScale.body, { color: colors.ink }]}>{trip.busNo}</Text>
            </Card>
            <Btn
              testID="trip-view-map"
              label={t('trip.viewMap')}
              onPress={() => navigation.navigate('LiveMap', { tripId: trip.id })}
              accent={accent}
              style={styles.cta}
            />
            {(role.key === 'driver' || role.key === 'conductor') && <RosterPanel tripId={trip.id} accent={accent} />}
            {vehicleChecks}
            <Btn testID="trip-end" label={t('trip.end')} onPress={onEnd} accent={colors.danger} loading={endTrip.isPending} style={styles.cta} />
          </>
        ) : (
          <>
            {assignment.data && (
              <Card>
                <Text style={[TextScale.cardTitle, { color: accent }]}>{assignment.data.route.name}</Text>
                <Text style={[TextScale.caption, { color: colors.inkSoft, marginTop: 4 }]}>{assignment.data.busNo}</Text>
                <View style={styles.pillRow}>
                  <Pill label={`${t('trip.stops')} · ${assignment.data.route.stops.length}`} color={accent} bg={colors.surface2} icon="route" />
                  {assignment.data.conductorName ? (
                    <Pill label={`${t('role.conductor')} · ${assignment.data.conductorName}`} color={colors.primary} bg={colors.primaryDim} icon="visitor" />
                  ) : null}
                  {role.key === 'conductor' && assignment.data.driverName ? (
                    <Pill label={`${t('role.driver')} · ${assignment.data.driverName}`} color={colors.primary} bg={colors.primaryDim} icon="visitor" />
                  ) : null}
                </View>
                <View style={[styles.dutyGrid, { borderTopColor: colors.line }]}>
                  <View style={styles.dutyCell}>
                    <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t('home.shift')}</Text>
                    <Text style={[TextScale.bodyStrong, { color: colors.ink }]}>{assignment.data.shift ?? '—'}</Text>
                  </View>
                  <View style={styles.dutyCell}>
                    <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t('home.students')}</Text>
                    <Text style={[TextScale.bodyStrong, { color: colors.ink }]}>{t('home.studentsAssigned', { n: assignment.data.studentsAssigned })}</Text>
                  </View>
                </View>
              </Card>
            )}
            {assignment.data && assignment.data.route.stops.length > 0 && (
              <Card>
                <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{t('trip.todaysRoute')}</Text>
                {assignment.data.route.stops.map((stop, i) => (
                  <View key={stop.id} style={styles.stopRow}>
                    <View style={[styles.stopNum, { backgroundColor: accent }]}>
                      <Text style={[TextScale.caption, { color: '#FFFFFF' }]}>{i + 1}</Text>
                    </View>
                    <Text style={[TextScale.body, { color: colors.ink, flex: 1 }]}>{stop.name}</Text>
                  </View>
                ))}
                <Btn
                  testID="trip-view-route-map"
                  label={t('trip.viewRouteMap')}
                  icon="route"
                  onPress={() => navigation.navigate('RoutePreview')}
                  accent={accent}
                  style={styles.cta}
                />
              </Card>
            )}
            {(role.key === 'driver' || role.key === 'conductor') && assignment.data && (
              <Card>
                <View style={styles.rosterHead}>
                  <Text style={[TextScale.cardTitle, { color: accent }]}>{t('trip.studentPickup')}</Text>
                  <Text testID="pretrip-pickup-count" style={[TextScale.bodyStrong, { color: colors.ink }]}>
                    {`0 / ${assignment.data.studentsAssigned}`}
                  </Text>
                </View>
                <ProgressBar testID="pretrip-pickup-progress" now={0} max={assignment.data.studentsAssigned} accent={accent} />
              </Card>
            )}
            {vehicleChecks}
            <View style={styles.segment}>
              {(['pickup', 'drop'] as TripDirection[]).map((d) => (
                <Pressable
                  key={d}
                  testID={`trip-dir-${d}`}
                  onPress={() => setDirection(d)}
                  style={[styles.segBtn, { backgroundColor: direction === d ? accent : colors.surface, borderColor: accent }]}
                >
                  <Text style={[TextScale.bodyStrong, { color: direction === d ? '#FFFFFF' : accent }]}>{t(`trip.dir.${d}`)}</Text>
                </Pressable>
              ))}
            </View>
            <Btn testID="trip-start" label={t('trip.start')} onPress={onStart} accent={accent} loading={startTrip.isPending} style={styles.cta} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  headerSpacer: { flex: 1 },
  body: { padding: 16, gap: 12 },
  banner: { borderRadius: 16, paddingVertical: 12, alignItems: 'center' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  segment: { flexDirection: 'row', gap: 10 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  cta: { marginTop: 4 },
  rosterHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressTrack: { height: 8, borderRadius: 8, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: '100%', borderRadius: 8 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1 },
  noRoute: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  dutyGrid: { flexDirection: 'row', gap: 20, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  dutyCell: { gap: 2 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  stopNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
