// src/components/ui/StatTrio.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { TextScale } from '@/theme/typography';
import { Ring } from './Ring';
import { Card } from './Card';
import { Icon } from '@/components/icons';

export interface StatTrioProps {
  hoursThisWeek: number;
  hoursTarget: number;
  streakDays?: number;
  leaveLeft?: number;
}

export const StatTrio: React.FC<StatTrioProps> = ({
  hoursThisWeek,
  hoursTarget,
  streakDays,
  leaveLeft,
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      {/* Hours ring */}
      <Card style={styles.ringCard}>
        <Ring
          value={hoursThisWeek}
          target={hoursTarget}
          size={88}
          label={String(hoursThisWeek)}
          sublabel={t('home.hoursWeek')}
        />
      </Card>

      {/* Streak + Leave stats */}
      {(streakDays !== undefined || leaveLeft !== undefined) && (
        <View style={styles.statColumn}>
          {/* Streak */}
          {streakDays !== undefined && (
            <Card testID="stat-streak" style={styles.statCard}>
              <View style={styles.statRow}>
                <Icon name="fire" size={20} color={colors.gold} strokeWidth={2} />
                <View style={styles.statText}>
                  <Text style={[TextScale.cardTitle, { color: colors.ink }]}>
                    {t('home.streakDays', { n: streakDays })}
                  </Text>
                  <Text style={[TextScale.caption, { color: colors.inkSoft }]}>
                    {t('home.streak')}
                  </Text>
                </View>
              </View>
            </Card>
          )}

          {/* Leave left */}
          {leaveLeft !== undefined && (
            <Card testID="stat-leave" style={styles.statCard}>
              <View style={styles.statRow}>
                <Icon name="gift" size={20} color={colors.primary} strokeWidth={2} />
                <View style={styles.statText}>
                  <Text style={[TextScale.cardTitle, { color: colors.ink }]}>
                    {t('home.leaveLeftN', { n: leaveLeft })}
                  </Text>
                  <Text style={[TextScale.caption, { color: colors.inkSoft }]}>
                    {t('home.leaveLeft')}
                  </Text>
                </View>
              </View>
            </Card>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  ringCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  statColumn: {
    flex: 1,
    gap: 12,
  },
  statCard: {
    flex: 1,
    justifyContent: 'center',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statText: {
    flex: 1,
  },
});
