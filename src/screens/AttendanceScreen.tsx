// src/screens/AttendanceScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { TextScale } from '@/theme/typography';
import {
  GeoRadar,
  CheckInButton,
  Confetti,
  type ConfettiHandle,
  IconBtn,
  useToast,
  AttendanceCalendar,
} from '@/components/ui';
import {
  useAttendanceStatus,
  useSchoolLocation,
  useCheckIn,
  useCheckOut,
} from '@/features/attendance/hooks';
import { useLeaveSummary } from '@/features/leave/hooks';
import { distanceMeters, formatDistance } from '@/lib/geo';
import { env } from '@/config/env';
import type { AttendanceLog } from '@/data/domain';

// QA-only affordance: local dev only. __DEV__ alone stays true for any
// `expo start` session regardless of which API it targets, so gating on
// __DEV__ alone let this toggle mask a real geofence mismatch once pointed
// at a real remote (staging/prod) backend. Gating on DATA_SOURCE === 'mock'
// is too strict — this project's own local dev .env targets a live backend
// on localhost, which is the common case, not the exception. Gate on the
// API host instead: only hide the toggle once it points somewhere that
// isn't the local machine.
function isLocalApiHost(): boolean {
  try {
    const host = new URL(env.API_BASE_URL).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2';
  } catch {
    return false;
  }
}
const SHOW_DEMO_RANGE_TOGGLE = __DEV__ && (env.DATA_SOURCE === 'mock' || isLocalApiHost());

interface HistoryDayGroup {
  dayKey: string;
  labelKey: 'attendance.history.today' | 'attendance.history.yesterday' | null;
  dateLabel: string;
  entries: AttendanceLog[];
}

// lastLog is newest-first; group consecutive entries by calendar day without
// re-sorting, so groups stay in newest-first order too.
function groupLogsByDay(logs: AttendanceLog[]): HistoryDayGroup[] {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const yesterday = today - 24 * 60 * 60 * 1000;

  const groups: HistoryDayGroup[] = [];
  for (const entry of logs) {
    const entryDate = new Date(entry.at);
    const dayStart = startOfDay(entryDate);
    const dayKey = String(dayStart);
    const last = groups[groups.length - 1];
    if (last && last.dayKey === dayKey) {
      last.entries.push(entry);
      continue;
    }
    groups.push({
      dayKey,
      labelKey:
        dayStart === today ? 'attendance.history.today' : dayStart === yesterday ? 'attendance.history.yesterday' : null,
      dateLabel: entryDate.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      entries: [entry],
    });
  }
  return groups;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export interface AttendanceScreenProps {
  navigation: any;
}

export const AttendanceScreen: React.FC<AttendanceScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors, role } = useTheme();
  const toast = useToast();

  const att = useAttendanceStatus();
  const leave = useLeaveSummary();
  const schoolLocation = useSchoolLocation();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();

  const confettiRef = useRef<ConfettiHandle>(null);

  // Geo state: 'locating' while waiting for location, then resolved
  const [locating, setLocating] = useState(true);
  const [position, setPosition] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);

  // __DEV__-only QA toggle: overrides the real GPS-derived in/out range so the
  // check-in flow can be exercised on a simulator without real geofence coords.
  // null = not overridden — use the real geo-derived state.
  const [demoInRange, setDemoInRange] = useState<boolean | null>(null);

  const [busy, setBusy] = useState(false);

  // Unmount guard — prevents setState after navigation away
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Request location on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status === 'granted') {
          try {
            const loc = await Location.getCurrentPositionAsync({});
            if (!cancelled) {
              setPosition({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                accuracy: loc.coords.accuracy ?? 0,
              });
            }
          } catch {
            // GPS unavailable — just stop locating
          }
        }
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Real distance from device position to the school's geofence center.
  const distanceM =
    position && schoolLocation.data
      ? distanceMeters({ lat: position.latitude, lng: position.longitude }, schoolLocation.data)
      : undefined;

  const geoInRange =
    distanceM !== undefined && schoolLocation.data
      ? distanceM <= schoolLocation.data.radiusMeters
      : false;

  // __DEV__ toggle takes precedence when set; otherwise use the real geo-derived state.
  const inRange = demoInRange !== null ? demoInRange : geoInRange;

  // Derive GeoRadar state
  const radarState: 'locating' | 'in' | 'out' = locating
    ? 'locating'
    : inRange
      ? 'in'
      : 'out';

  // One check-in/check-out cycle per day: once today's check-out is logged,
  // lock the button until the next calendar day rather than allow re-checking in.
  const hasCompletedToday = !att.data?.checkedIn
    && (att.data?.lastLog ?? []).some((l) => l.kind === 'out' && isToday(l.at));

  // Derive CheckInButton state
  type CIState = 'locating' | 'out' | 'ready' | 'checkedIn' | 'doneForToday';
  const checkInState: CIState = att.data?.checkedIn
    ? 'checkedIn'
    : hasCompletedToday
      ? 'doneForToday'
      : locating
        ? 'locating'
        : !inRange
          ? 'out'
          : 'ready';

  const handlePress = useCallback(async () => {
    if (checkInState === 'ready') {
      if (!position) {
        toast.show(t('common.somethingWrong'), 'error');
        return;
      }
      setBusy(true);
      await new Promise<void>(resolve => setTimeout(resolve, 650));
      if (!mountedRef.current) return;
      try {
        await checkIn.mutateAsync({
          at: new Date().toISOString(),
          lat: position.latitude,
          lng: position.longitude,
          accuracyMeters: position.accuracy,
        });
        if (!mountedRef.current) return;
        confettiRef.current?.fire();
      } catch {
        if (mountedRef.current) toast.show(t('common.somethingWrong'), 'error');
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    } else if (checkInState === 'checkedIn' && position) {
      checkOut.mutate({
        at: new Date().toISOString(),
        lat: position.latitude,
        lng: position.longitude,
        accuracyMeters: position.accuracy,
      });
    }
  }, [checkInState, position, checkIn, checkOut, t, toast]);

  // Helper text. When the __DEV__ demo toggle is overriding the real
  // GPS-derived range, flag it inline — otherwise this can visibly
  // contradict the always-real distance readout shown in GeoRadar above it.
  const demoSuffix = demoInRange !== null ? ` (${t('attendance.demoOverride')})` : '';
  const helperText = hasCompletedToday
    ? t('attendance.doneForTodayHelper')
    : locating
      ? t('attendance.locating')
      : inRange
        ? t('attendance.inZone') + demoSuffix
        : t('attendance.outZone', { distance: distanceM !== undefined ? formatDistance(distanceM) : '?' }) + demoSuffix;

  // Full check-in/check-out history, grouped by calendar day (newest first).
  const history = att.data?.lastLog ?? [];
  const historyGroups = groupLogsByDay(history);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      {/* Back header */}
      <View style={styles.header}>
        <IconBtn
          icon="back"
          onPress={() => navigation.goBack()}
          label={t('attendance.title')}
          color={colors.ink}
        />
        <Text style={[TextScale.screenTitle, styles.headerTitle, { color: colors.ink }]}>
          {t('attendance.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* GeoRadar */}
        <View style={styles.radarRow}>
          <GeoRadar
            state={radarState}
            distanceM={distanceM}
            accuracyM={position?.accuracy}
            accent={role.accent}
          />
        </View>

        {/* Demo range segmented toggle — dev-only QA affordance, never ships in production */}
        {SHOW_DEMO_RANGE_TOGGLE && (
          <View style={styles.segmented}>
            <Pressable
              testID="demo-in-range"
              onPress={() => { setDemoInRange(true); setLocating(false); }}
              style={[
                styles.segBtn,
                styles.segBtnLeft,
                {
                  backgroundColor: demoInRange === true ? role.accent : colors.surface,
                  borderColor: colors.line,
                },
              ]}
              accessibilityRole="button"
            >
              <Text
                style={[
                  TextScale.caption,
                  { color: demoInRange === true ? colors.onPrimary : colors.ink },
                ]}
              >
                {t('attendance.inRange')}
              </Text>
            </Pressable>
            <Pressable
              testID="demo-out-range"
              onPress={() => { setDemoInRange(false); setLocating(false); }}
              style={[
                styles.segBtn,
                styles.segBtnRight,
                {
                  backgroundColor: demoInRange === false ? colors.danger : colors.surface,
                  borderColor: colors.line,
                },
              ]}
              accessibilityRole="button"
            >
              <Text
                style={[
                  TextScale.caption,
                  { color: demoInRange === false ? colors.onPrimary : colors.ink },
                ]}
              >
                {t('attendance.outRange')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* CheckInButton */}
        <View style={styles.btnRow}>
          <CheckInButton
            state={checkInState}
            busy={busy}
            onPress={handlePress}
            accent={role.accent}
          />
        </View>

        {/* Helper text */}
        <Text style={[TextScale.body, styles.helperText, { color: colors.inkSoft }]}>
          {helperText}
        </Text>

        <AttendanceCalendar
          logs={history}
          leaveRequests={(leave.data?.requests ?? []).filter((r) => r.status !== 'rejected')}
        />

        {/* Check-in/check-out history */}
        <View style={styles.historySection}>
          <Text style={[TextScale.cardTitle, styles.historyTitle, { color: colors.ink }]}>
            {t('attendance.history.title')}
          </Text>
          {historyGroups.length === 0 ? (
            <Text style={[TextScale.caption, { color: colors.inkSoft }]}>
              {t('attendance.history.empty')}
            </Text>
          ) : (
            historyGroups.map((group) => (
              <View key={group.dayKey} style={styles.historyGroup}>
                <Text style={[TextScale.caption, styles.historyDayLabel, { color: colors.inkSoft }]}>
                  {group.labelKey ? t(group.labelKey) : group.dateLabel}
                </Text>
                {group.entries.map((entry, i) => (
                  <View
                    key={entry.at + i}
                    style={[styles.logRow, { backgroundColor: colors.surface, borderColor: colors.line }]}
                  >
                    <Text style={[TextScale.body, { color: colors.ink }]}>
                      {t(
                        entry.kind === 'in' ? 'attendance.history.checkedIn' : 'attendance.history.checkedOut',
                        { time: new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
                      )}
                    </Text>
                    <Text
                      style={[
                        TextScale.caption,
                        { color: entry.inZone ? role.accent : colors.danger },
                      ]}
                    >
                      {t(entry.inZone ? 'attendance.history.zoneIn' : 'attendance.history.zoneOut')}
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Confetti overlay */}
      <Confetti ref={confettiRef} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 24,
  },
  radarRow: {
    marginTop: 16,
    alignItems: 'center',
    flexShrink: 0,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
  },
  segBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnLeft: {
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    borderRightWidth: 0,
  },
  segBtnRight: {
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  btnRow: {
    alignItems: 'center',
    flexShrink: 0,
  },
  helperText: {
    textAlign: 'center',
  },
  historySection: {
    width: '100%',
    gap: 8,
  },
  historyTitle: {
    marginBottom: 4,
  },
  historyGroup: {
    width: '100%',
    gap: 8,
  },
  historyDayLabel: {
    marginTop: 4,
  },
  logRow: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
  },
});
