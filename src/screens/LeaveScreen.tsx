import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useTheme } from '@/theme';
import { useLeaveSummary, useSubmitLeave } from '@/features/leave/hooks';
import { Card, Btn, Pill, Skeleton } from '@/components/ui';
import { ErrorState } from '@/components/state';
import { TextScale } from '@/theme/typography';
import type { LeaveType } from '@/data/domain';

const TYPES: LeaveType[] = ['casual', 'sick', 'earned'];
const schema = z.object({
  type: z.enum(['casual', 'sick', 'earned']),
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
  reason: z.string().min(3),
});

export const LeaveScreen = () => {
  const { t } = useTranslation();
  const { colors, role } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useLeaveSummary();
  const submit = useSubmitLeave();
  const today = new Date().toISOString().split('T')[0];
  const [type, setType] = useState<LeaveType>('casual');
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async () => {
    const parsed = schema.safeParse({ type, fromDate, toDate, reason });
    if (!parsed.success) { setError(t('leave.invalid')); return; }
    setError(null);
    try {
      await submit.mutateAsync(parsed.data);
      setSubmitted(true);
      setReason('');
    } catch {
      setError(t('leave.submitError'));
    }
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
      <Text style={[TextScale.screenTitle, styles.title, { color: colors.ink }]}>{t('leave.title')}</Text>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}>
        {isLoading ? <Skeleton width="100%" height={90} radius={16} />
          : isError ? <ErrorState onRetry={refetch} />
          : (
            <>
              <View style={styles.balances}>
                {data?.balances.map((b) => (
                  <Card key={b.type} style={styles.balCard}>
                    <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t(`leave.type.${b.type}`)}</Text>
                    <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{b.total - b.used} / {b.total}</Text>
                  </Card>
                ))}
              </View>

              <Card>
                <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{t('leave.apply')}</Text>
                <View style={styles.typeRow}>
                  {TYPES.map((ty) => (
                    <Pressable key={ty} testID={`leave-type-${ty}`} onPress={() => setType(ty)} style={[styles.typeBtn, { backgroundColor: type === ty ? role.accent : colors.surface, borderColor: role.accent }]}>
                      <Text style={[TextScale.caption, { color: type === ty ? '#FFFFFF' : role.accent }]}>{t(`leave.type.${ty}`)}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput testID="leave-from" placeholder={t('leave.from')} placeholderTextColor={colors.inkFaint} value={fromDate} onChangeText={setFromDate} style={[styles.input, { borderColor: colors.sunken, color: colors.ink }]} />
                <TextInput testID="leave-to" placeholder={t('leave.to')} placeholderTextColor={colors.inkFaint} value={toDate} onChangeText={setToDate} style={[styles.input, { borderColor: colors.sunken, color: colors.ink }]} />
                <TextInput testID="leave-reason" placeholder={t('leave.reason')} placeholderTextColor={colors.inkFaint} value={reason} onChangeText={setReason} style={[styles.input, { borderColor: colors.sunken, color: colors.ink }]} />
                {error ? <Text style={[TextScale.caption, { color: colors.danger }]}>{error}</Text> : null}
                <Btn testID="leave-submit" label={t('leave.submit')} onPress={onSubmit} accent={role.accent} loading={submit.isPending} style={styles.cta} />
                {submitted ? <View testID="leave-submitted"><Pill label={t('leave.submitted')} color={colors.success} bg={colors.successSoft} icon="check" /></View> : null}
              </Card>

              <Text style={[TextScale.cardTitle, { color: colors.ink, marginTop: 4 }]}>{t('leave.history')}</Text>
              {data?.requests.map((r) => (
                <Card key={r.id}>
                  <Text style={[TextScale.body, { color: colors.ink }]}>{t(`leave.type.${r.type}`)} · {r.fromDate} → {r.toDate}</Text>
                  <Pill label={t(`leave.status.${r.status}`)} color={r.status === 'approved' ? colors.success : r.status === 'rejected' ? colors.danger : colors.warn} bg={colors.surface2} />
                  {r.status !== 'pending' && (r.decidedByName || r.decidedNote) ? (
                    <Text testID={`leave-decision-${r.id}`} style={[TextScale.caption, { color: colors.inkSoft, marginTop: 6 }]}>
                      {r.decidedByName ? t('leave.decidedBy', { name: r.decidedByName }) : ''}
                      {r.decidedByName && r.decidedNote ? ' · ' : ''}
                      {r.decidedNote ?? ''}
                    </Text>
                  ) : null}
                </Card>
              ))}
            </>
          )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { paddingHorizontal: 16, paddingTop: 12 },
  body: { padding: 16, gap: 12 },
  balances: { flexDirection: 'row', gap: 10 },
  balCard: { flex: 1 },
  typeRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  typeBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 },
  cta: { marginTop: 4 },
});
