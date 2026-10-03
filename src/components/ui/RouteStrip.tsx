import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { TextScale } from '@/theme/typography';
import { Card } from './Card';
import type { RouteTimelineStop, RouteTimelineStatus } from '@/features/trip/stopProgress';

export interface RouteStripProps {
  /** Every stop on the route, in order, each with its status (see routeTimelineFor). */
  stops: RouteTimelineStop[];
  accent: string;
}

/** Vertical route timeline: one row per stop with its name and status (done / at stop / next). */
export const RouteStrip: React.FC<RouteStripProps> = ({ stops, accent }) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (stops.length === 0) return null;

  const badge = (status: RouteTimelineStatus): string | null =>
    status === 'done'
      ? t('trip.stopDone')
      : status === 'current'
        ? t('trip.stopAtStop')
        : status === 'next'
          ? t('trip.stopNext')
          : null;

  return (
    <Card>
      {stops.map((s, i) => {
        const filled = s.status === 'done' || s.status === 'current';
        const active = s.status === 'current' || s.status === 'next';
        const isLast = i === stops.length - 1;
        const label = badge(s.status);
        return (
          <View key={s.id} style={styles.row} testID={`route-stop-${s.status}`}>
            <View style={styles.rail}>
              <View style={[styles.line, { backgroundColor: i === 0 ? 'transparent' : colors.sunken }]} />
              <View style={[styles.dot, { backgroundColor: filled ? accent : colors.surface, borderColor: accent }]} />
              <View style={[styles.line, { backgroundColor: isLast ? 'transparent' : colors.sunken }]} />
            </View>
            <Text
              style={[
                active ? TextScale.bodyStrong : TextScale.body,
                styles.name,
                { color: s.status === 'upcoming' ? colors.inkSoft : colors.ink },
              ]}
              numberOfLines={1}
            >
              {s.name}
            </Text>
            {label ? (
              <Text style={[TextScale.caption, { color: s.status === 'upcoming' ? colors.inkSoft : accent }]}>
                {label}
              </Text>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  rail: { width: 28, alignItems: 'center', alignSelf: 'stretch' },
  line: { width: 2, flex: 1 },
  dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  name: { flex: 1, paddingLeft: 6 },
});
