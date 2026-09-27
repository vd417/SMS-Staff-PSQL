// src/components/ui/Card.tsx
import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

export interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  testID?: string;
}

export const Card: React.FC<CardProps> = ({ children, style, padded = true, testID }) => {
  const { colors } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          ...colors.shadow,
        },
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  padded: {
    padding: 16,
  },
});
