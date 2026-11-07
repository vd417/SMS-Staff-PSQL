// src/components/ui/Avatar.tsx
import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';
import { TextScale } from '@/theme/typography';

export interface AvatarProps {
  name: string;
  size?: number;
  ring?: string;
  /** Profile photo. Initials show when this is missing or fails to load. */
  photoUri?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export const Avatar: React.FC<AvatarProps> = ({ name, size = 40, ring, photoUri }) => {
  const { role } = useTheme();
  const initials = getInitials(name);
  const ringColor = ring ?? role.accent;
  const fontSize = Math.round(size * 0.38);
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const showPhoto = !!photoUri && photoUri !== brokenUri;

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: role.accentSoft,
        },
        ring !== undefined && { borderWidth: 2, borderColor: ringColor },
      ]}
    >
      {showPhoto ? (
        <Image
          testID="avatar-photo"
          source={{ uri: photoUri }}
          accessibilityLabel="Profile photo"
          style={{ width: size, height: size }}
          onError={() => {
            if (photoUri) setBrokenUri(photoUri);
          }}
        />
      ) : (
        <Text
          style={[
            TextScale.micro,
            { color: ringColor, fontSize, lineHeight: undefined },
          ]}
        >
          {initials}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
