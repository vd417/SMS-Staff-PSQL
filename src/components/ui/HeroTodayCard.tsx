// src/components/ui/HeroTodayCard.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { TextScale } from '@/theme/typography';
import { Pill } from './Pill';

export interface HeroTodayCardProps {
  timing: string;
  dutyPostLabel: string;
  dutyPost: string;
  checkedIn: boolean;
  checkInAt?: string;
  onPressCheckIn: () => void;
}

function formatLocalTime(iso: string): string {
  try {
    const d = new Date(iso);
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
  } catch {
    return iso;
  }
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export const HeroTodayCard: React.FC<HeroTodayCardProps> = ({
  timing,
  dutyPostLabel,
  dutyPost,
  checkedIn,
  checkInAt,
  onPressCheckIn,
}) => {
  const { colors, role } = useTheme();
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState<string>('');

  useEffect(() => {
    if (!checkedIn || !checkInAt) return;
    const checkInDate = new Date(checkInAt);
    const tick = () => {
      const ms = Date.now() - checkInDate.getTime();
      setElapsed(formatElapsed(ms));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [checkedIn, checkInAt]);

  const gradientColors: [string, string] = checkedIn
    ? [role.accent, role.accent]
    : [colors.primary, colors.primaryDim];

  // Both states now use a full accent/primary background, so text is always light.
  const onPrimaryColor = colors.onPrimary;

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      {/* Status pill */}
      <Pill
        label={checkedIn ? t('home.onDuty') : t('home.notCheckedIn')}
        color={colors.onPrimary}
        bg={checkedIn ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)'}
      />

      {/* Two columns: timing + duty post */}
      <View style={styles.columns}>
        <View style={styles.column}>
          <Text style={[TextScale.micro, { color: 'rgba(255,255,255,0.7)' }]}>
            {t('home.timing')}
          </Text>
          <Text style={[TextScale.body, { color: onPrimaryColor }]}>{timing || '—'}</Text>
        </View>
        <View style={styles.column}>
          <Text style={[TextScale.micro, { color: 'rgba(255,255,255,0.7)' }]}>
            {dutyPostLabel}
          </Text>
          <Text style={[TextScale.body, { color: onPrimaryColor }]}>{dutyPost || '—'}</Text>
        </View>
      </View>

      {/* Check-in action / status */}
      {!checkedIn ? (
        <Pressable
          testID="hero-checkin"
          onPress={onPressCheckIn}
          style={[styles.checkInBtn, { backgroundColor: colors.gold }]}
          accessible
          accessibilityRole="button"
          accessibilityLabel={t('home.tapCheckIn')}
        >
          <Text style={[TextScale.button, { color: colors.ink }]}>
            {t('home.tapCheckIn')}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.checkedInRow}>
          <Text style={[TextScale.caption, { color: onPrimaryColor }]}>
            {t('home.checkedInAt', { time: checkInAt ? formatLocalTime(checkInAt) : '' })}
          </Text>
          {elapsed !== '' && (
            <Text style={[TextScale.micro, { color: onPrimaryColor, marginLeft: 8 }]}>
              {elapsed}
            </Text>
          )}
        </View>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 20,
    gap: 16,
    flexShrink: 0,
  },
  columns: {
    flexDirection: 'row',
    gap: 24,
  },
  column: {
    gap: 2,
  },
  checkInBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  checkedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
