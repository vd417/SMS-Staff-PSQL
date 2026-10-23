// src/components/ui/TabBar.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { Icon } from '@/components/icons';
import type { IconName } from '@/components/icons';
import { useChatUnread } from '@/features/chat/hooks';
import { TextScale } from '@/theme/typography';

export interface TabBarProps {
  state: any;
  navigation: any;
  descriptors: any;
}

// Icon names for the 4 tabs
const TAB_ICONS: Record<string, IconName> = {
  Home: 'home',
  Inbox: 'mail',
  Leave: 'gift',
  Tasks: 'tasks',
  Me: 'user',
};

const TAB_LABEL_KEY: Record<string, string> = {
  Home: 'nav.home',
  Tasks: 'nav.tasks',
  Leave: 'nav.leave',
  Inbox: 'nav.inbox',
  Me: 'nav.me',
};

const BAR_HEIGHT = 76;
const BAR_SIDE_INSET = 14;
const BAR_RADIUS = 26;

export const TabBar: React.FC<TabBarProps> = ({ state, navigation, descriptors }) => {
  const { t } = useTranslation();
  const { colors, role } = useTheme();
  const insets = useSafeAreaInsets();
  const inboxUnread = useChatUnread();

  const routes: { key: string; name: string }[] = state.routes;
  const activeIndex: number = state.index;

  const handleTabPress = (route: { key: string; name: string }, index: number) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  const renderTab = (route: { key: string; name: string }, index: number) => {
    const isFocused = index === activeIndex;
    const iconName = TAB_ICONS[route.name] ?? 'home';
    const iconColor = isFocused ? role.accent : colors.inkFaint;
    const labelKey = TAB_LABEL_KEY[route.name];
    const label = labelKey ? t(labelKey) : (descriptors[route.key]?.options.tabBarAccessibilityLabel ?? route.name);

    return (
      <Pressable
        key={route.key}
        testID={`tab-${route.name}`}
        onPress={() => handleTabPress(route, index)}
        style={styles.tab}
        accessibilityRole="button"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
      >
        <View style={styles.tabInner}>
          <View>
            <Icon
              name={iconName}
              size={22}
              color={iconColor}
              strokeWidth={isFocused ? 2.5 : 2}
            />
            {route.name === 'Inbox' && inboxUnread > 0 ? (
              <View testID="inbox-badge" style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.surface }]}>
                <Text style={[TextScale.caption, styles.badgeText]}>{inboxUnread > 9 ? '9+' : String(inboxUnread)}</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={[styles.tabLabel, { color: iconColor }]}>
            {label}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.outerContainer,
        {
          paddingBottom: insets.bottom + 8,
          paddingTop: 8,
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
          pointerEvents: 'box-none',
        },
      ]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.surface,
            shadowColor: colors.ink,
            borderColor: colors.line,
          },
        ]}
      >
        <View style={styles.tabSection}>
          {routes.map((route, i) => renderTab(route, i))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: BAR_SIDE_INSET,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bar: {
    width: '100%',
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    // Elevation (Android)
    elevation: 12,
    // Shadow (iOS)
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  tabSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: BAR_HEIGHT,
    minWidth: 44,
    paddingHorizontal: 2,
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, lineHeight: 12, fontWeight: '700' },
});
