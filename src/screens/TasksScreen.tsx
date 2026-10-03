import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { useTasks, useCompleteTask } from '@/features/tasks/hooks';
import { Card, IconBtn, Pill, Skeleton } from '@/components/ui';
import { ErrorState } from '@/components/state';
import { TextScale } from '@/theme/typography';
import type { Task } from '@/data/domain';

/** One task row. Completing opens an inline required-remark field; Submit completes with it. */
function TaskRow({ task }: { task: Task }) {
  const { t } = useTranslation();
  const { colors, role } = useTheme();
  const complete = useCompleteTask();
  const [expanded, setExpanded] = useState(false);
  const [remark, setRemark] = useState('');
  const canSubmit = remark.trim().length > 0 && !complete.isPending;

  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text
            style={[
              TextScale.body,
              { color: task.done ? colors.inkFaint : colors.ink, textDecorationLine: task.done ? 'line-through' : 'none' },
            ]}
          >
            {task.title}
          </Text>
          {task.dueLabel ? <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{task.dueLabel}</Text> : null}
        </View>
        {task.priority === 'urgent' && !task.done ? (
          <Pill label={t('tasks.urgent')} color={colors.danger} bg={colors.dangerSoft} icon="alert" />
        ) : null}
        {task.done ? (
          <View testID={`task-done-${task.id}`}>
            <Pill label={t('tasks.done')} color={colors.success} bg={colors.successSoft} icon="check" />
          </View>
        ) : (
          <IconBtn
            testID={`task-complete-${task.id}`}
            icon="check"
            label={t('tasks.complete')}
            color="#FFFFFF"
            bg={role.accent}
            onPress={() => setExpanded((e) => !e)}
          />
        )}
      </View>

      {task.done && task.remark ? (
        <Text testID={`task-remark-${task.id}`} style={[TextScale.caption, styles.remarkDone, { color: colors.inkSoft }]}>
          {t('tasks.remarkLabel')}: {task.remark}
        </Text>
      ) : null}

      {!task.done && expanded ? (
        <View style={styles.remarkBox}>
          <TextInput
            testID={`task-remark-input-${task.id}`}
            value={remark}
            onChangeText={setRemark}
            placeholder={t('tasks.remarkPlaceholder')}
            placeholderTextColor={colors.inkFaint}
            multiline
            style={[
              TextScale.body,
              styles.remarkInput,
              { color: colors.ink, borderColor: colors.line, backgroundColor: colors.surface },
            ]}
          />
          <Pressable
            testID={`task-submit-${task.id}`}
            disabled={!canSubmit}
            onPress={() => { if (canSubmit) complete.mutate({ id: task.id, remark: remark.trim() }); }}
            style={[styles.submitBtn, { backgroundColor: canSubmit ? role.accent : colors.sunken }]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
          >
            <Text style={[TextScale.button, { color: canSubmit ? '#FFFFFF' : colors.inkFaint }]}>
              {t('tasks.submit')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

export const TasksScreen = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useTasks();

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
        <View style={styles.body}>
          <Skeleton width="100%" height={72} radius={16} />
          <Skeleton width="100%" height={72} radius={16} />
        </View>
      </SafeAreaView>
    );
  }
  if (isError) {
    return <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}><ErrorState onRetry={refetch} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
      <Text style={[TextScale.screenTitle, styles.title, { color: colors.ink }]}>{t('nav.tasks')}</Text>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}>
        {data?.map((task) => <TaskRow key={task.id} task={task} />)}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { paddingHorizontal: 16, paddingTop: 12 },
  body: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  remarkDone: { marginTop: 8 },
  remarkBox: { marginTop: 12, gap: 8 },
  remarkInput: { minHeight: 64, borderWidth: 1, borderRadius: 12, padding: 12, textAlignVertical: 'top' },
  submitBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
});
