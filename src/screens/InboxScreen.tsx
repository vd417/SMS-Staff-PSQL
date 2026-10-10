import React, { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { Card, Pill, Skeleton } from '@/components/ui';
import { ErrorState } from '@/components/state';
import { TextScale } from '@/theme/typography';
import { useStaffAnnouncements, useMarkInboxSeen } from '@/features/inbox/hooks';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

export const InboxScreen = () => {
  const { t } = useTranslation();
  const { colors, role } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useStaffAnnouncements();
  const markSeen = useMarkInboxSeen();

  // Opening the inbox clears the tab badge.
  useEffect(() => { markSeen(); }, [markSeen]);

  return (
    <SafeAreaView testID="inbox-screen" style={[styles.fill, { backgroundColor: colors.bg }]}>
      <Text style={[TextScale.screenTitle, { color: colors.ink }, styles.title]}>{t('inbox.title')}</Text>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}>
        {isLoading ? <Skeleton width="100%" height={80} radius={16} />
          : isError ? <ErrorState onRetry={refetch} />
          : data && data.length > 0 ? data.map((a) => (
            <Card key={a.id} testID={`announcement-${a.id}`}>
              <View style={styles.row}>
                <Text style={[TextScale.cardTitle, { color: colors.ink, flex: 1 }]}>{a.title}</Text>
                {a.pinned ? <Pill label={t('inbox.pinned')} color="#FFFFFF" bg={role.accent} /> : null}
              </View>
              {a.body ? <Text style={[TextScale.body, { color: colors.inkSoft, marginTop: 4 }]}>{a.body}</Text> : null}
              <Text style={[TextScale.caption, { color: colors.inkFaint, marginTop: 6 }]}>
                {formatDate(a.date)}{a.from ? ` · ${a.from}` : ''}
              </Text>
            </Card>
          )) : (
            <Text testID="inbox-empty" style={[TextScale.caption, { color: colors.inkSoft, marginTop: 8 }]}>{t('inbox.empty')}</Text>
          )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { paddingHorizontal: 16, paddingTop: 12 },
  body: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
