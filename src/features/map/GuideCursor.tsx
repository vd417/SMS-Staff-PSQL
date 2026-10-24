import React from 'react';
import { View, StyleSheet } from 'react-native';

/** Pale dot marking where the dotted guide meets the route. */
export const GuideCursor = () => <View testID="map-guide-cursor" style={styles.cursor} />;

const styles = StyleSheet.create({
  cursor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(185, 228, 218, 0.85)',
    borderWidth: 2,
    borderColor: '#0E5C4A',
  },
});
