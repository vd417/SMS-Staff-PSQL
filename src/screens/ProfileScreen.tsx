import React, { useState } from 'react';
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
import { Card, Avatar, Pill, Btn, Skeleton, SectionLabel, RolePill } from '@/components/ui';
import { ErrorState } from '@/components/state';
import { Icon, type IconName } from '@/components/icons';
import { TextScale } from '@/theme/typography';

function formatJoined(value: string): string {
  if (/^\d{4}$/.test(value)) return value;
  const iso = /^\d{4}-\d{2}-\d{2}/.test(value) ? `${value.slice(0, 10)}T00:00:00` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const ProfileScreen = () => {
  const { t } = useTranslation();
  const { colors, dark, setDark, role } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const logout = useLogout();
  const navigation = useNavigation();
  const { data, isLoading, isError, refetch } = useProfile();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const currentLanguage = SUPPORTED_LANGUAGES.find((lang) => lang.code === i18next.language) ?? SUPPORTED_LANGUAGES[0];

  if (!session) return null;
  const u = session.user;
  const dutyLine = [u.dutyPost, u.shift, u.timing].filter(Boolean).join(' · ');
  const stats = [
    u.empId ? { label: t('profile.employeeId'), value: u.empId } : null,
    u.joined ? { label: t('profile.joined'), value: formatJoined(u.joined) } : null,
    u.rating > 0 ? { label: t('profile.rating'), value: `${u.rating}★` } : null,
  ].filter((item): item is { label: string; value: string } => item != null);

  const hasDriverDetails = Boolean(
    data?.licenseNumber || data?.licenseExpiry || data?.emergencyContactName || data?.emergencyContactPhone,
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}>
        <Card padded={false}>
          <View style={[styles.band, { backgroundColor: role.accent }]} />
          <View style={styles.identity}>
            <View style={[styles.avatarWrap, { backgroundColor: colors.surface }]}>
              <Avatar name={u.name} size={76} ring={role.accent} />
            </View>
            <Text style={[TextScale.screenTitle, styles.center, { color: colors.ink }]}>{u.name}</Text>
            <View style={styles.roleWrap}>
              <RolePill role={u.roleKey} />
            </View>
            {dutyLine ? (
              <Text style={[TextScale.caption, styles.center, { color: colors.inkSoft }]}>{dutyLine}</Text>
            ) : null}
            {stats.length > 0 ? (
              <View style={styles.stats}>
                {stats.map((item) => (
                  <View key={item.label} style={styles.stat}>
                    <Text style={[TextScale.bodyStrong, styles.center, { color: colors.ink }]} numberOfLines={2}>
                      {item.value}
                    </Text>
                    <Text style={[TextScale.micro, styles.statLabel, { color: colors.inkSoft }]}>{item.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </Card>

        <View style={styles.section}>
          <SectionLabel title={t('profile.documents')} />
          {isLoading ? <Skeleton width="100%" height={88} radius={22} />
            : isError ? <ErrorState onRetry={refetch} />
            : (data?.documents.length ?? 0) === 0 ? (
              <Card>
                <Text style={[TextScale.body, { color: colors.inkSoft }]}>{t('profile.emptyDocuments')}</Text>
              </Card>
            ) : (
              <Card padded={false}>
                {data?.documents.map((doc, index) => (
                  <View key={doc.id}>
                    {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.line }]} /> : null}
                    <View style={styles.row}>
                      <View style={[styles.iconTile, { backgroundColor: colors.sunken }]}>
                        <Icon name="doc" size={20} color={doc.ok ? colors.success : colors.inkSoft} strokeWidth={1.9} />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={[TextScale.bodyStrong, { color: colors.ink }]}>{doc.label}</Text>
                        <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{doc.value}</Text>
                      </View>
                      {doc.ok ? <Pill label={t('profile.verified')} color={colors.success} bg={colors.successSoft} icon="check" /> : null}
                    </View>
                  </View>
                ))}
              </Card>
            )}
        </View>

        {hasDriverDetails ? (
          <View style={styles.section}>
            <SectionLabel title={t('profile.driverDetails')} />
            <Card padded={false}>
              {data?.licenseNumber ? (
                <DetailRow
                  icon="license"
                  label={t('profile.licenseNumber')}
                  value={data.licenseNumber}
                  tint={role.accent}
                  tile={role.accentSoft}
                />
              ) : null}
              {data?.licenseExpiry ? (
                <>
                  {data.licenseNumber ? <View style={[styles.divider, { backgroundColor: colors.line }]} /> : null}
                  <DetailRow
                    icon="clock"
                    label={t('profile.licenseExpiry')}
                    value={new Date(data.licenseExpiry).toLocaleDateString()}
                    tint={colors.warn}
                    tile={colors.warnSoft}
                  />
                </>
              ) : null}
              {(data?.emergencyContactName || data?.emergencyContactPhone) ? (
                <>
                  {(data?.licenseNumber || data?.licenseExpiry) ? <View style={[styles.divider, { backgroundColor: colors.line }]} /> : null}
                  <DetailRow
                    icon="phone"
                    label={t('profile.emergencyContact')}
                    value={[data?.emergencyContactName, data?.emergencyContactPhone].filter(Boolean).join(' · ')}
                    tint={colors.danger}
                    tile={colors.dangerSoft}
                  />
                </>
              ) : null}
            </Card>
          </View>
        ) : null}

        <Card padded={false}>
            <Pressable
              testID="my-attendance"
              onPress={() => navigation.navigate('Attendance' as never)}
              style={styles.row}
            >
              <View style={[styles.iconTile, { backgroundColor: role.accentSoft }]}>
                <Icon name="clock" size={20} color={role.accent} strokeWidth={1.9} />
              </View>
              <View style={styles.rowText}>
                <Text style={[TextScale.bodyStrong, { color: colors.ink }]}>{t('profile.myAttendance')}</Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.inkFaint} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: colors.line }]} />
            <Pressable
              testID="apply-leave"
              onPress={() => navigation.navigate('Leave' as never)}
              style={styles.row}
            >
              <View style={[styles.iconTile, { backgroundColor: colors.goldSoft }]}>
                <Icon name="doc" size={20} color={colors.gold} strokeWidth={1.9} />
              </View>
              <View style={styles.rowText}>
                <Text style={[TextScale.bodyStrong, { color: colors.ink }]}>{t('profile.applyLeave')}</Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.inkFaint} />
            </Pressable>
        </Card>

        <Card padded={false}>
          <Pressable testID="settings-toggle" onPress={() => setSettingsOpen((open) => !open)} style={styles.row}>
            <View style={[styles.iconTile, { backgroundColor: role.accentSoft }]}>
              <Icon name={dark ? 'moon' : 'sun'} size={20} color={role.accent} strokeWidth={1.9} />
            </View>
            <View style={styles.rowText}>
              <Text style={[TextScale.bodyStrong, { color: colors.ink }]}>{t('profile.settings')}</Text>
              <Text style={[TextScale.caption, { color: colors.inkSoft }]}>
                {currentLanguage.native} · {dark ? t('profile.dark') : t('profile.light')}
              </Text>
            </View>
            <Icon name={settingsOpen ? 'chevronDown' : 'chevronRight'} size={18} color={colors.inkFaint} />
          </Pressable>
          {settingsOpen ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.line }]} />
              <View style={styles.row}>
                <Text style={[TextScale.bodyStrong, styles.rowText, { color: colors.ink }]}>{t('profile.appearance')}</Text>
                <View style={[styles.segment, { backgroundColor: colors.sunken }]}>
                  <Pressable
                    testID="theme-light"
                    onPress={() => setDark(false)}
                    style={[styles.segmentItem, !dark && { backgroundColor: colors.surface }]}
                  >
                    <Text style={[TextScale.caption, { color: !dark ? role.accent : colors.inkSoft }]}>{t('profile.light')}</Text>
                  </Pressable>
                  <Pressable
                    testID="toggle-theme"
                    onPress={() => setDark(true)}
                    style={[styles.segmentItem, dark && { backgroundColor: colors.surface }]}
                  >
                    <Text style={[TextScale.caption, { color: dark ? role.accent : colors.inkSoft }]}>{t('profile.dark')}</Text>
                  </Pressable>
                </View>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.line }]} />
              <View style={styles.langHead}>
                <Icon name="globe" size={18} color={role.accent} strokeWidth={1.9} />
                <Text style={[TextScale.bodyStrong, { color: colors.ink }]}>{t('common.language')}</Text>
              </View>
              {SUPPORTED_LANGUAGES.map((lang) => {
                const active = i18next.language === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    testID={`lang-${lang.code}`}
                    onPress={() => { void setLanguage(lang.code); }}
                    style={[styles.langRow, active && { backgroundColor: role.accentSoft }]}
                  >
                    <Text style={[TextScale.body, { color: active ? role.accent : colors.ink }]}>{lang.native}</Text>
                    {active ? <Icon name="check" size={18} color={role.accent} strokeWidth={2.4} /> : null}
                  </Pressable>
                );
              })}
            </>
          ) : null}
        </Card>

        <Btn
          testID="logout"
          label={t('profile.logout')}
          accent={colors.danger}
          onPress={() => logout.mutate()}
          loading={logout.isPending}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

function DetailRow({
  icon,
  label,
  value,
  tint,
  tile,
}: {
  icon: IconName;
  label: string;
  value: string;
  tint: string;
  tile: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.iconTile, { backgroundColor: tile }]}>
        <Icon name={icon} size={20} color={tint} strokeWidth={1.9} />
      </View>
      <View style={styles.rowText}>
        <Text style={[TextScale.bodyStrong, { color: colors.ink }]}>{label}</Text>
        <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: 16, gap: 18 },
  band: { height: 78 },
  identity: { alignItems: 'center', marginTop: -40, paddingHorizontal: 16, paddingBottom: 18, gap: 8 },
  avatarWrap: { padding: 4, borderRadius: 48 },
  roleWrap: { alignSelf: 'center' },
  center: { textAlign: 'center' },
  stats: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 8, gap: 8 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: { textAlign: 'center', textTransform: 'uppercase' },
  section: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowText: { flex: 1, gap: 2 },
  iconTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, marginHorizontal: 14 },
  langHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  langRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 10, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 14 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 2 },
  segmentItem: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
});
