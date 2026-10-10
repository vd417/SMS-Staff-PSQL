import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';
import { Icon } from '@/components/icons';
import type { StopRole } from './stopRoles';

export interface StopMarkerProps {
  role: StopRole;
  isDestination: boolean;
}

const shadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.25,
  shadowRadius: 3,
  elevation: 3,
} as const;

export const StopMarker: React.FC<StopMarkerProps> = ({ role, isDestination }) => {
  const { colors } = useTheme();

  if (isDestination) {
    return (
      <View testID="stop-marker-destination" style={[styles.destination, shadow, { backgroundColor: colors.gold, borderColor: colors.surface }]}>
        <Icon name="home" size={16} color="#FFFFFF" strokeWidth={2} />
      </View>
    );
  }

  if (role === 'completed') {
    return (
      <View testID="stop-marker-completed" style={[styles.small, shadow, { backgroundColor: colors.inkFaint, borderColor: colors.surface }]}>
        <Icon name="check" size={10} color="#FFFFFF" strokeWidth={3} />
      </View>
    );
  }

  if (role === 'current') {
    // Pulse ring + solid core so the active stop reads at a glance, Uber-style.
    return (
      <View testID="stop-marker-current" style={styles.currentWrap}>
        <View style={[styles.currentPulse, { backgroundColor: colors.primary }]} />
        <View style={[styles.large, shadow, { backgroundColor: colors.primary, borderColor: colors.surface }]} />
      </View>
    );
  }

  if (role === 'next') {
    return <View testID="stop-marker-next" style={[styles.medium, shadow, { backgroundColor: colors.surface, borderColor: colors.primary }]} />;
  }

  return <View testID="stop-marker-upcoming" style={[styles.dot, shadow, { backgroundColor: colors.surface, borderColor: colors.inkFaint }]} />;
};

const styles = StyleSheet.create({
  destination: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
  },
  currentWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  currentPulse: { position: 'absolute', width: 36, height: 36, borderRadius: 18, opacity: 0.2 },
  large: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
  },
  medium: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
  },
  small: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
});
