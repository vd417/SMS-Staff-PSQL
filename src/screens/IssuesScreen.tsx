import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Image, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useTheme } from '@/theme';
import { useIssues, useReportIssue, useIssueDetail } from '@/features/issues/hooks';
import { useCurrentTrip } from '@/features/trip/hooks';
import { Card, Btn, Pill, Skeleton, IconBtn, useToast } from '@/components/ui';
import { ErrorState } from '@/components/state';
import { TextScale } from '@/theme/typography';
import type { IssueCategory, IssuePriority, IssueStatus } from '@/data/domain';

const CATEGORIES: IssueCategory[] = ['vehicle', 'student', 'route', 'safety', 'other'];
const PRIORITIES: IssuePriority[] = ['normal', 'high', 'emergency'];
// Backend caps the photo field at ~400,000 base64 chars (~300KB); leave headroom.
const MAX_PHOTO_BASE64_LENGTH = 380000;
const MAX_PHOTO_DIMENSION = 1024;

export interface IssuesScreenProps {
  navigation: any;
}

function statusColor(status: IssueStatus, colors: ReturnType<typeof useTheme>['colors']) {
  if (status === 'resolved' || status === 'closed') return colors.success;
  if (status === 'in_progress') return colors.warn;
  return colors.inkSoft;
}

export const IssuesScreen: React.FC<IssuesScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors, role } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useIssues();
  const currentTrip = useCurrentTrip();
  const report = useReportIssue();
  const toast = useToast();

  const [category, setCategory] = useState<IssueCategory>('other');
  const [priority, setPriority] = useState<IssuePriority>('normal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // The list omits photos for bandwidth; a report's photo is fetched on demand when it's opened.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const detail = useIssueDetail(expandedId ?? undefined);

  const attachPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    try {
      const rendered = await ImageManipulator.manipulate(asset.uri)
        .resize({ width: MAX_PHOTO_DIMENSION })
        .renderAsync();
      const resized = await rendered.saveAsync({ base64: true, compress: 0.5, format: SaveFormat.JPEG });
      if (!resized.base64) return;
      if (resized.base64.length > MAX_PHOTO_BASE64_LENGTH) {
        toast.show(t('issues.photoTooLarge'), 'error');
        return;
      }
      setPhotoUri(`data:image/jpeg;base64,${resized.base64}`);
    } catch {
      toast.show(t('issues.submitError'), 'error');
    }
  };

  const onSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      setError(t('issues.invalid'));
      return;
    }
    setError(null);
    try {
      await report.mutateAsync({
        category,
        title,
        description,
        priority,
        tripId: currentTrip.data?.id,
        photoUri,
      });
      setSubmitted(true);
      setTitle('');
      setDescription('');
      setPhotoUri(undefined);
    } catch {
      toast.show(t('issues.submitError'), 'error');
    }
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <IconBtn icon="back" label={t('common.back')} onPress={() => navigation.goBack()} />
        <Text style={[TextScale.screenTitle, { color: colors.ink }]}>{t('issues.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}>
        <Card>
          <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t('issues.category')}</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                testID={`issue-category-${c}`}
                onPress={() => setCategory(c)}
                style={[styles.chip, { backgroundColor: category === c ? role.accent : colors.surface, borderColor: role.accent }]}
              >
                <Text style={[TextScale.caption, { color: category === c ? '#FFFFFF' : role.accent }]}>{t(`issues.category.${c}`)}</Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            testID="issue-title"
            placeholder={t('issues.titlePlaceholder')}
            placeholderTextColor={colors.inkFaint}
            value={title}
            onChangeText={setTitle}
            style={[styles.input, { borderColor: colors.sunken, color: colors.ink }]}
          />
          <TextInput
            testID="issue-description"
            placeholder={t('issues.description')}
            placeholderTextColor={colors.inkFaint}
            value={description}
            onChangeText={setDescription}
            multiline
            style={[styles.input, styles.multiline, { borderColor: colors.sunken, color: colors.ink }]}
          />

          <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t('issues.priority')}</Text>
          <View style={styles.chipRow}>
            {PRIORITIES.map((p) => (
              <Pressable
                key={p}
                testID={`issue-priority-${p}`}
                onPress={() => setPriority(p)}
                style={[styles.chip, { backgroundColor: priority === p ? role.accent : colors.surface, borderColor: role.accent }]}
              >
                <Text style={[TextScale.caption, { color: priority === p ? '#FFFFFF' : role.accent }]}>{t(`issues.priority.${p}`)}</Text>
              </Pressable>
            ))}
          </View>

          <Btn testID="issue-attach-photo" label={t('issues.attachPhoto')} variant="ghost" icon="camera" onPress={attachPhoto} style={styles.spacer} />
          {error ? <Text style={[TextScale.caption, { color: colors.danger }]}>{error}</Text> : null}
          <Btn testID="issue-submit" label={t('issues.submit')} onPress={onSubmit} accent={role.accent} loading={report.isPending} style={styles.cta} />
          {submitted ? <View testID="issue-submitted"><Pill label={t('issues.submitted')} color={colors.success} bg={colors.successSoft} icon="check" /></View> : null}
        </Card>

        <Text style={[TextScale.cardTitle, { color: colors.ink, marginTop: 4 }]}>{t('issues.myIssues')}</Text>
        {isLoading ? <Skeleton width="100%" height={64} radius={16} />
          : isError ? <ErrorState onRetry={refetch} />
          : data && data.length > 0 ? data.map((issue) => (
            <Card key={issue.id}>
              <Pressable
                testID={`issue-row-${issue.id}`}
                accessibilityRole="button"
                onPress={() => setExpandedId((cur) => (cur === issue.id ? null : issue.id))}
                style={styles.issueRow}
              >
                <Text style={[TextScale.body, { color: colors.ink, flex: 1 }]}>{issue.title}</Text>
                <Pill label={t(`issues.status.${issue.status}`)} color={statusColor(issue.status, colors)} bg={colors.surface2} />
              </Pressable>
              {expandedId === issue.id ? (
                <View style={styles.detail}>
                  {detail.isLoading ? <View testID="issue-photo-loading"><Skeleton width="100%" height={180} radius={12} /></View>
                    : detail.isError ? <ErrorState onRetry={detail.refetch} />
                    : detail.data?.photoUrl
                      ? <Image testID="issue-photo" source={{ uri: detail.data.photoUrl }} style={styles.photo} resizeMode="cover" />
                      : <Text testID="issue-no-photo" style={[TextScale.caption, { color: colors.inkSoft }]}>{t('issues.noPhoto')}</Text>}
                </View>
              ) : null}
            </Card>
          )) : <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t('issues.empty')}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  headerSpacer: { flex: 1 },
  body: { padding: 16, gap: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  spacer: { marginTop: 4, marginBottom: 8 },
  cta: { marginTop: 4 },
  issueRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detail: { marginTop: 10 },
  photo: { width: '100%', height: 180, borderRadius: 12 },
});
