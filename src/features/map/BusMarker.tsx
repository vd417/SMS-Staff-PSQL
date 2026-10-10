import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Icon } from '@/components/icons';

export interface BusMarkerProps {
  headingDeg?: number;
}

/**
 * Uber/Ola-style vehicle marker: a solid badge that stays upright (so the bus glyph is always
 * readable) with a separate heading cone that rotates to the GPS bearing, over a soft accuracy
 * pulse ring. Heading is applied only to the cone, never the badge.
 */
export const BusMarker: React.FC<BusMarkerProps> = ({ headingDeg }) => (
  <View testID="bus-marker" style={styles.wrap}>
    <View style={styles.pulse} />
    {headingDeg != null && (
      <View style={[styles.coneWrap, { transform: [{ rotate: `${headingDeg}deg` }] }]}>
        <View style={styles.cone} />
      </View>
    )}
    <View style={styles.badge}>
      <Icon name="bus" size={18} color="#FFFFFF" strokeWidth={2} />
    </View>
  </View>
);

const PRIMARY = '#0E5C4A';

const styles = StyleSheet.create({
  wrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PRIMARY,
    opacity: 0.16,
  },
  coneWrap: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    // the cone sits just above the badge and the whole wrapper rotates around centre
  },
  cone: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: PRIMARY,
    marginTop: 1,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
});
