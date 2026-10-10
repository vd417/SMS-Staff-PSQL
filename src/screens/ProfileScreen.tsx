import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '@/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLogout } from '@/features/auth/hooks';
import { useProfile } from '@/features/profile/hooks';
import { SUPPORTED_LANGUAGES, setLanguage } from '@/i18n';
import { Card, Avatar, Pill, Btn, Skeleton } from '@/components/ui';
import { ErrorState } from '@/components/state';
import { TextScale } from '@/theme/typography';

export const ProfileScreen = () => {
  const { t } = useTranslation();
  const { colors, dark, toggleDark, role } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const logout = useLogout();
  const navigation = useNavigation();
  const { data, isLoading, isError, refetch } = useProfile();

  if (!session) return null;
  const u = session.user;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}>
        <View style={styles.identity}>
          <Avatar name={u.name} size={64} ring={role.accent} />
          <View style={styles.identityText}>
            <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{u.name}</Text>
            <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t(role.labelKey)} · {u.empId}</Text>
          </View>
        </View>

        {(data?.licenseNumber || data?.licenseExpiry || data?.emergencyContactName || data?.emergencyContactPhone) ? (
          <>
            <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{t('profile.driverDetails')}</Text>
            <Card>
              {data?.licenseNumber ? (
                <View style={styles.settingRow}>
                  <Text style={[TextScale.body, { color: colors.ink }]}>{t('profile.licenseNumber')}</Text>
                  <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{data.licenseNumber}</Text>
                </View>
              ) : null}
              {data?.licenseExpiry ? (
                <View style={styles.settingRow}>
                  <Text style={[TextScale.body, { color: colors.ink }]}>{t('profile.licenseExpiry')}</Text>
                  <Text style={[TextScale.caption, { color: colors.inkSoft }]}>
                    {new Date(data.licenseExpiry).toLocaleDateString()}
                  </Text>
                </View>
              ) : null}
              {(data?.emergencyContactName || data?.emergencyContactPhone) ? (
                <View style={styles.settingRow}>
                  <Text style={[TextScale.body, { color: colors.ink }]}>{t('profile.emergencyContact')}</Text>
                  <Text style={[TextScale.caption, { color: colors.inkSoft }]}>
                    {[data?.emergencyContactName, data?.emergencyContactPhone].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              ) : null}
            </Card>
          </>
        ) : null}

        <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{t('profile.documents')}</Text>
        {isLoading ? <Skeleton width="100%" height={64} radius={16} />
          : isError ? <ErrorState onRetry={refetch} />
          : data?.documents.map((doc) => (
            <Card key={doc.id}>
              <View style={styles.docRow}>
                <View style={styles.docText}>
                  <Text style={[TextScale.body, { color: colors.ink }]}>{doc.label}</Text>
                  <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{doc.value}</Text>
                </View>
                {doc.ok ? <Pill label={t('profile.verified')} color={colors.success} bg={colors.successSoft} icon="check" /> : null}
              </View>
            </Card>
          ))}

        <Text style={[TextScale.cardTitle, { color: colors.ink, marginTop: 8 }]}>{t('profile.settings')}</Text>
        <Card>
          <Pressable testID="toggle-theme" onPress={toggleDark} style={styles.settingRow}>
            <Text style={[TextScale.body, { color: colors.ink }]}>{t('profile.darkMode')}</Text>
            <Text style={[TextScale.caption, { color: role.accent }]}>{dark ? t('profile.on') : t('profile.off')}</Text>
          </Pressable>
        </Card>

        <Text style={[TextScale.cardTitle, { color: colors.ink, marginTop: 8 }]}>{t('common.language')}</Text>
        <Card>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const active = i18next.language === lang.code;
            return (
              <Pressable key={lang.code} testID={`lang-${lang.code}`} onPress={() => setLanguage(lang.code)} style={styles.settingRow}>
                <Text style={[TextScale.body, { color: colors.ink }]}>{lang.native}</Text>
                {active ? <Text style={[TextScale.caption, { color: role.accent }]}>✓</Text> : null}
              </Pressable>
            );
          })}
        </Card>

        <Btn testID="my-attendance" label={t('profile.myAttendance')} variant="ghost" icon="clock" onPress={() => navigation.navigate('Attendance' as never)} style={styles.spacer} />
        <Btn label={t('profile.applyLeave')} variant="ghost" icon="doc" onPress={() => navigation.navigate('Leave' as never)} />
        <Btn testID="logout" label={t('profile.logout')} accent={colors.danger} onPress={() => logout.mutate()} loading={logout.isPending} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: 16, gap: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  identityText: { gap: 2 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docText: { flex: 1, gap: 2 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  spacer: { marginTop: 8 },
});
