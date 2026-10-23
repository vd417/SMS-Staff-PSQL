// src/screens/HomeScreen.tsx
import React, { useCallback, useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDashboard } from '@/features/dashboard/hooks';
import { useAttendanceStatus } from '@/features/attendance/hooks';
import { useAttachTaskPhoto } from '@/features/tasks/hooks';
import { useInboxUnread } from '@/features/inbox/hooks';
import { useToast } from '@/components/ui';
import {
  Header,
  HeroTodayCard,
  StatTrio,
  RoleSpecializedCard,
  TasksPeek,
  AlertCard,
  Skeleton,
  QuickActionsGrid,
  type QuickAction,
} from '@/components/ui';
import { ErrorState } from '@/components/state';
import type { RoleCard } from '@/data/domain';

function shiftTiming(card: RoleCard | null): string {
  if (card?.kind === 'driver' || card?.kind === 'conductor') return card.shift ?? '';
  return '';
}

export const HomeScreen = ({ navigation }: { navigation: any }) => {
  const { t } = useTranslation();
  const { colors, dark, toggleDark, role } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { data: d, isLoading, isError, refetch } = useDashboard();
  const att = useAttendanceStatus();
  const refetchAttendance = att.refetch;
  useEffect(() => {
    if (typeof navigation.addListener !== 'function') return;
    return navigation.addListener('focus', () => {
      void refetchAttendance?.();
      void refetch();
    });
  }, [navigation, refetch, refetchAttendance]);
  const attachTaskPhoto = useAttachTaskPhoto();
  const notifUnread = useInboxUnread();
  const toast = useToast();

  const openAttendance = () => navigation.navigate('Attendance');

  const handleAttachPhoto = useCallback(async (taskId: string) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      toast.show(t('home.photoPermissionDenied'), 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const photoUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
    try {
      await attachTaskPhoto.mutateAsync({ id: taskId, photoUri });
    } catch {
      toast.show(t('common.somethingWrong'), 'error');
    }
  }, [attachTaskPhoto, t, toast]);

  const quickActions: QuickAction[] = role.key === 'driver' || role.key === 'conductor'
    ? [
        { testID: 'home-open-trip', label: t('home.myRoute'), icon: 'bus', onPress: () => navigation.navigate('Trip') },
        { testID: 'home-vehicle-check', label: t('home.vehicleCheck'), icon: 'check', onPress: () => navigation.navigate('VehicleCheck') },
        { testID: 'home-my-tasks', label: t('home.myTasks'), icon: 'tasks', onPress: () => navigation.navigate('Tasks') },
        { testID: 'home-report-issue', label: t('issues.reportIssue'), icon: 'alert', onPress: () => navigation.navigate('Issues') },
      ]
    : [
        { testID: 'home-attendance', label: t('attendance.title'), icon: 'clock', onPress: openAttendance },
        { testID: 'home-my-tasks', label: t('home.myTasks'), icon: 'tasks', onPress: () => navigation.navigate('Tasks') },
        { testID: 'home-report-issue', label: t('issues.reportIssue'), icon: 'alert', onPress: () => navigation.navigate('Issues') },
        { testID: 'home-leave', label: t('leave.title'), icon: 'gift', onPress: () => navigation.navigate('Leave') },
      ];

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
        <View style={styles.skeletonContainer}>
          {/* Header placeholder */}
          <Skeleton width="60%" height={24} radius={8} style={styles.skeletonItem} />
          <Skeleton width="40%" height={16} radius={8} style={styles.skeletonItem} />
          {/* Card placeholders */}
          <Skeleton width="100%" height={140} radius={16} style={styles.skeletonItem} />
          <Skeleton width="100%" height={100} radius={16} style={styles.skeletonItem} />
          <Skeleton width="100%" height={120} radius={16} style={styles.skeletonItem} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  if (!d || !session) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 160 }]} showsVerticalScrollIndicator={false}>
        <Header
          schoolName={session.tenant.name}
          firstName={session.user.firstName}
          staffName={session.user.name}
          dark={dark}
          onToggleTheme={toggleDark}
          onPressBell={() => navigation.navigate('Notifications')}
          notifications={notifUnread}
        />
        <View style={styles.stack}>
        <Animated.View entering={FadeInDown.delay(0).duration(300)}>
          <HeroTodayCard
            timing={session.user.timing || shiftTiming(d.roleCard)}
            dutyPostLabel={t('home.dutyPostLabel')}
            dutyPost={att.data?.dutyPost || session.user.dutyPost}
            checkedIn={att.data?.checkedIn ?? false}
            checkInAt={att.data?.checkInAt}
            onPressCheckIn={openAttendance}
          />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(65).duration(300)}>
          <StatTrio
            streakDays={d.streakDays}
            leaveLeft={d.leaveLeft}
          />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(130).duration(300)}>
          <RoleSpecializedCard
            roleCard={d.roleCard}
            accent={role.accent}
            onViewDetails={() => navigation.navigate('Trip')}
          />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(160).duration(300)}>
          <QuickActionsGrid title={t('home.quickActions')} actions={quickActions} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(195).duration(300)}>
          <TasksPeek
            tasks={d.pendingTasksPeek}
            onViewAll={() => navigation.navigate('Tasks')}
            onAttachPhoto={handleAttachPhoto}
          />
        </Animated.View>
        {d.alert && (
          <Animated.View entering={FadeInDown.delay(260).duration(300)}>
            <AlertCard message={d.alert} />
          </Animated.View>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  scrollContent: {
    gap: 12,
  },
  stack: {
    paddingHorizontal: 16,
    gap: 12,
  },
  skeletonContainer: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  skeletonItem: {
    marginBottom: 4,
  },
});
