// Month calendar for My Attendance: work days (a check-in) and leave days.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { TextScale } from '@/theme/typography';
import type { AttendanceLog, LeaveRequest } from '@/data/domain';

export interface AttendanceCalendarProps {
  logs: AttendanceLog[];
  leaveRequests: LeaveRequest[];
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Calendar day from a YYYY-MM-DD leave date, or a timestamp in local time. */
function parseDay(iso: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed);
}

function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cursor = startOfDay(from);
  const end = startOfDay(to);
  while (cursor.getTime() <= end.getTime() && days.length < 366) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({ logs, leaveRequests }) => {
  const { t } = useTranslation();
  const { colors, role } = useTheme();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const workDays = useMemo(() => {
    const set = new Set<string>();
    for (const log of logs) {
      if (log.kind !== 'in') continue;
      const day = parseDay(log.at);
      if (day) set.add(dayKey(day));
    }
    return set;
  }, [logs]);

  const leaveDays = useMemo(() => {
    const set = new Set<string>();
    for (const req of leaveRequests) {
      if (req.status === 'rejected') continue;
      const from = parseDay(req.fromDate);
      const to = parseDay(req.toDate);
      if (!from || !to) continue;
      for (const day of eachDay(from, to)) set.add(dayKey(day));
    }
    return set;
  }, [leaveRequests]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dayKey(startOfDay(new Date()));
  const monthLabel = cursor.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, i + 1).toLocaleDateString([], { weekday: 'narrow' })),
    [],
  );

  const cells: Array<{ day: number } | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1 })),
  ];

  return (
    <View testID="attendance-calendar" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{t('attendance.calendar.title')}</Text>
      <View style={styles.monthRow}>
        <Pressable testID="calendar-prev" accessibilityRole="button" onPress={() => setCursor(new Date(year, month - 1, 1))} hitSlop={8}>
          <Text style={[TextScale.cardTitle, { color: role.accent }]}>{'‹'}</Text>
        </Pressable>
        <Text style={[TextScale.bodyStrong, { color: colors.ink }]}>{monthLabel}</Text>
        <Pressable testID="calendar-next" accessibilityRole="button" onPress={() => setCursor(new Date(year, month + 1, 1))} hitSlop={8}>
          <Text style={[TextScale.cardTitle, { color: role.accent }]}>{'›'}</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {weekdayLabels.map((label, i) => (
          <View key={`w-${i}`} style={styles.cell}>
            <Text style={[TextScale.micro, { color: colors.inkFaint }]}>{label}</Text>
          </View>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <View key={`e-${i}`} style={styles.cell} />;
          const key = dayKey(new Date(year, month, cell.day));
          const onLeave = leaveDays.has(key);
          const worked = workDays.has(key);
          const isToday = key === todayKey;
          const bg = onLeave ? colors.goldSoft : worked ? role.accent : 'transparent';
          const fg = worked && !onLeave ? colors.onPrimary : colors.ink;
          return (
            <View key={key} style={styles.cell}>
              <View
                testID={`calendar-day-${key}`}
                style={[
                  styles.day,
                  { backgroundColor: bg },
                  isToday && { borderColor: role.accent, borderWidth: 1.5 },
                ]}
              >
                <Text style={[TextScale.caption, { color: fg }]}>{cell.day}</Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: role.accent }]} />
          <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t('attendance.calendar.work')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: colors.goldSoft, borderColor: colors.gold, borderWidth: 1 }]} />
          <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t('attendance.calendar.leave')}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  day: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
