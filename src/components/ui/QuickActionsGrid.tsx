// src/components/ui/QuickActionsGrid.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';
import { TextScale } from '@/theme/typography';
import { SectionLabel } from './SectionLabel';
import { Icon } from '@/components/icons';
import type { IconName } from '@/components/icons';

export interface QuickAction {
  testID: string;
  label: string;
  icon: IconName;
  onPress: () => void;
}

export interface QuickActionsGridProps {
  title: string;
  actions: QuickAction[];
}

function iconTone(icon: IconName, dark: boolean): { color: string; bg: string } {
  switch (icon) {
    case 'bus':
      return { color: dark ? '#5DDBB8' : '#0E5C4A', bg: dark ? 'rgba(51,191,159,0.22)' : '#CDE7DF' };
    case 'check':
      return { color: dark ? '#45C589' : '#1F8A58', bg: dark ? 'rgba(69,197,137,0.22)' : '#D4EFE0' };
    case 'tasks':
      return { color: dark ? '#7EB0F0' : '#2F6FC4', bg: dark ? 'rgba(59,127,212,0.28)' : '#D6E6FA' };
    case 'alert':
      return { color: dark ? '#F0786C' : '#D04538', bg: dark ? 'rgba(240,120,108,0.22)' : '#F8DAD5' };
    case 'clock':
      return { color: dark ? '#F2C766' : '#C48412', bg: dark ? 'rgba(242,199,102,0.22)' : '#FBEAC2' };
    case 'gift':
      return { color: dark ? '#F09AB8' : '#C2567E', bg: dark ? 'rgba(194,86,126,0.28)' : '#F6D6E4' };
    default:
      return { color: dark ? '#5DDBB8' : '#0E5C4A', bg: dark ? 'rgba(51,191,159,0.22)' : '#CDE7DF' };
  }
}

export const QuickActionsGrid: React.FC<QuickActionsGridProps> = ({ title, actions }) => {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <SectionLabel title={title} />
      <View style={styles.grid}>
        {actions.map((a) => {
          const tone = iconTone(a.icon, colors.dark);
          return (
            <Pressable
              key={a.testID}
              testID={a.testID}
              onPress={a.onPress}
              style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.line }]}
            >
              <View style={[styles.iconBadge, { backgroundColor: tone.bg }]}>
                <Icon name={a.icon} size={22} color={tone.color} />
              </View>
              <Text style={[TextScale.caption, styles.label, { color: colors.ink }]}>
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  tile: {
    width: '48%',
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    textAlign: 'center',
    width: '100%',
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
