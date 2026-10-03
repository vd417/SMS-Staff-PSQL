// src/components/ui/StatTrio.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { TextScale } from '@/theme/typography';
import { Card } from './Card';
import { Icon } from '@/components/icons';

export interface StatTrioProps {
  streakDays?: number;
  leaveLeft?: number;
}

/** Home stats: streak and leave-left cards. (The weekly-hours ring was removed.) */
export const StatTrio: React.FC<StatTrioProps> = ({ streakDays, leaveLeft }) => {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (streakDays === undefined && leaveLeft === undefined) return null;

  return (
    <View style={styles.row}>
      {/* Streak */}
      {streakDays !== undefined && (
        <Card testID="stat-streak" style={styles.statCard}>
          <View style={styles.statRow}>
            <Icon name="fire" size={20} color={colors.gold} strokeWidth={2} />
            <View style={styles.statText}>
              <Text style={[TextScale.cardTitle, { color: colors.ink }]}>
                {t('home.streakDays', { n: streakDays })}
              </Text>
              <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t('home.streak')}</Text>
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
              <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t('home.leaveLeft')}</Text>
            </View>
          </View>
        </Card>
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
