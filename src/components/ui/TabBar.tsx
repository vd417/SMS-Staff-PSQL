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
  Inbox: 'chat',
  Leave: 'calendar',
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

/** Height of the tab row above the system inset. Chat uses this to sit above the keyboard. */
export const TAB_BAR_BODY_HEIGHT = 62;

export function tabBarHeight(bottomInset: number): number {
  return TAB_BAR_BODY_HEIGHT + Math.max(bottomInset, 8);
}

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
          <View style={[styles.iconSlot, isFocused && { backgroundColor: role.accentSoft }]}>
            <Icon
              name={iconName}
              size={22}
              color={iconColor}
              strokeWidth={isFocused ? 2.4 : 1.9}
            />
            {route.name === 'Inbox' && inboxUnread > 0 ? (
              <View testID="inbox-badge" style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.surface }]}>
                <Text style={[TextScale.caption, styles.badgeText]}>{inboxUnread > 9 ? '9+' : String(inboxUnread)}</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={[styles.tabLabel, { color: iconColor, fontWeight: isFocused ? '800' : '600' }]}>
            {label}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
      ]}
    >
      {routes.map((route, i) => renderTab(route, i))}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TAB_BAR_BODY_HEIGHT - 6,
    minWidth: 44,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconSlot: {
    width: 52,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: 6,
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
