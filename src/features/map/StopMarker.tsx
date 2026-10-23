import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';
import type { StopRole } from './stopRoles';

export interface StopMarkerProps {
  role: StopRole;
  isDestination: boolean;
  /** Place name for this stop, shown on the map. */
  name: string;
  /** Pale ring used when the van is off the route and this stop is nearby. */
  near?: boolean;
}

const shadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.25,
  shadowRadius: 3,
  elevation: 3,
} as const;

const NEAR_HALO = '#CDE7DF';
const NEAR_FILL = '#E8F7F2';

export const StopMarker: React.FC<StopMarkerProps> = ({ role, isDestination, name, near }) => {
  const { colors } = useTheme();
  const pinColor = near
    ? NEAR_FILL
    : isDestination
      ? colors.gold
      : role === 'completed'
        ? colors.inkFaint
        : role === 'current'
          ? colors.primary
          : colors.surface;
  const pinBorder = near || role === 'next' || role === 'current' ? colors.primary : isDestination ? colors.surface : colors.inkFaint;
  const roleId = near
    ? undefined
    : isDestination
      ? 'stop-marker-destination'
      : role === 'completed'
        ? 'stop-marker-completed'
        : role === 'current'
          ? 'stop-marker-current'
          : role === 'next'
            ? 'stop-marker-next'
            : 'stop-marker-upcoming';

  return (
    <View testID={near ? 'stop-marker-near' : roleId} style={styles.col}>
      {near && <View style={[styles.nearHalo, { backgroundColor: NEAR_HALO }]} />}
      <View
        testID={near && isDestination ? 'stop-marker-destination' : undefined}
        style={[styles.pin, shadow, { backgroundColor: pinColor, borderColor: pinBorder }]}
      />
      <View style={[styles.label, shadow, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text testID="stop-marker-name" numberOfLines={2} style={[styles.name, { color: colors.ink }]}>
          {name}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  col: { alignItems: 'center', maxWidth: 148 },
  pin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    zIndex: 1,
  },
  nearHalo: {
    position: 'absolute',
    top: -8,
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  label: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 148,
  },
  name: { fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 15 },
});
