import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { useTripAssignment } from '@/features/trip/hooks';
import { useSubmitInspection, useSubmitFuelLog } from '@/features/vehicleChecks/hooks';
import { Card, Btn, Pill, Skeleton, IconBtn, useToast } from '@/components/ui';
import { Icon } from '@/components/icons';
import { ErrorState } from '@/components/state';
import { TextScale } from '@/theme/typography';

const CHECKLIST_ITEMS = ['brakes', 'tyres', 'lights', 'horn', 'firstAidKit', 'fireExtinguisher', 'emergencyExit', 'fuelLevel'] as const;
type ChecklistKey = (typeof CHECKLIST_ITEMS)[number];

export interface VehicleCheckScreenProps {
  navigation: any;
}

export const VehicleCheckScreen: React.FC<VehicleCheckScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors, role } = useTheme();
  const insets = useSafeAreaInsets();
  const assignment = useTripAssignment();
  const busId = assignment.data?.busId;
  const submitInspection = useSubmitInspection(busId ?? '');
  const submitFuelLog = useSubmitFuelLog(busId ?? '');
  const toast = useToast();

  const [checklist, setChecklist] = useState<Record<ChecklistKey, boolean>>({
    brakes: false, tyres: false, lights: false, horn: false,
    firstAidKit: false, fireExtinguisher: false, emergencyExit: false, fuelLevel: false,
  });
  const [remarks, setRemarks] = useState('');
  const [inspectionSubmitted, setInspectionSubmitted] = useState(false);
  const [odometerKm, setOdometerKm] = useState('');
  const [fuelAddedLiters, setFuelAddedLiters] = useState('');
  const [fuelSaved, setFuelSaved] = useState(false);

  const toggle = (key: ChecklistKey) => setChecklist((c) => ({ ...c, [key]: !c[key] }));

  const onSubmitInspection = async () => {
    if (!busId) return;
    try {
      await submitInspection.mutateAsync({ busId, ...checklist, remarks: remarks.trim() || undefined });
      setInspectionSubmitted(true);
    } catch {
      toast.show(t('vehicleCheck.submitError'), 'error');
    }
  };

  const onSaveFuelLog = async () => {
    if (!busId) return;
    const odometer = Number(odometerKm);
    const liters = Number(fuelAddedLiters);
    if (!Number.isFinite(odometer) || odometer < 0 || !Number.isFinite(liters) || liters <= 0) {
      toast.show(t('vehicleCheck.fuelInvalid'), 'error');
      return;
    }
    try {
      await submitFuelLog.mutateAsync({ busId, odometerKm: odometer, fuelAddedLiters: liters });
      setFuelSaved(true);
      setOdometerKm('');
      setFuelAddedLiters('');
    } catch {
      toast.show(t('vehicleCheck.submitError'), 'error');
    }
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <IconBtn icon="back" label={t('common.back')} onPress={() => navigation.goBack()} />
        <Text style={[TextScale.screenTitle, { color: colors.ink }]}>{t('vehicleCheck.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}>
        {assignment.isLoading ? (
          <Skeleton width="100%" height={220} radius={16} />
        ) : assignment.isError ? (
          <ErrorState onRetry={assignment.refetch} />
        ) : !busId ? (
          <Text style={[TextScale.body, { color: colors.inkSoft }]}>{t('vehicleCheck.noBus')}</Text>
        ) : (
          <>
            <Card>
              <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{t('vehicleCheck.checklist')}</Text>
              {CHECKLIST_ITEMS.map((key) => (
                <Pressable
                  key={key}
                  testID={`vehicle-check-${key}`}
                  onPress={() => toggle(key)}
                  style={[styles.checkRow, { borderColor: colors.sunken, backgroundColor: colors.surface2 }]}
                >
                  <View style={[
                    styles.checkbox,
                    { borderColor: role.accent, backgroundColor: checklist[key] ? role.accent : 'transparent' },
                  ]}
                  >
                    {checklist[key] && <Icon name="check" size={12} color="#FFFFFF" />}
                  </View>
                  <Text style={[TextScale.body, { color: colors.ink }]}>{t(`vehicleCheck.${key}`)}</Text>
                </Pressable>
              ))}
              <TextInput
                testID="vehicle-check-remarks"
                placeholder={t('vehicleCheck.remarksPlaceholder')}
                placeholderTextColor={colors.inkFaint}
                value={remarks}
                onChangeText={setRemarks}
                multiline
                style={[styles.input, styles.multiline, { borderColor: colors.sunken, color: colors.ink }]}
              />
              <Btn
                testID="vehicle-check-submit"
                label={t('vehicleCheck.submit')}
                onPress={onSubmitInspection}
                accent={role.accent}
                loading={submitInspection.isPending}
                disabled={inspectionSubmitted}
                style={styles.cta}
              />
              {inspectionSubmitted ? (
                <View testID="vehicle-check-submitted">
                  <Pill label={t('vehicleCheck.submitted')} color={colors.success} bg={colors.successSoft} icon="check" />
                </View>
              ) : null}
            </Card>

            <Card>
              <Text style={[TextScale.cardTitle, { color: colors.ink }]}>{t('vehicleCheck.fuelRecord')}</Text>
              <TextInput
                testID="fuel-log-odometer"
                placeholder={t('vehicleCheck.odometer')}
                placeholderTextColor={colors.inkFaint}
                value={odometerKm}
                onChangeText={(v) => { setOdometerKm(v); setFuelSaved(false); }}
                keyboardType="numeric"
                style={[styles.input, { borderColor: colors.sunken, color: colors.ink }]}
              />
              <TextInput
                testID="fuel-log-liters"
                placeholder={t('vehicleCheck.fuelAdded')}
                placeholderTextColor={colors.inkFaint}
                value={fuelAddedLiters}
                onChangeText={(v) => { setFuelAddedLiters(v); setFuelSaved(false); }}
                keyboardType="numeric"
                style={[styles.input, { borderColor: colors.sunken, color: colors.ink }]}
              />
              <Btn
                testID="fuel-log-save"
                label={t('vehicleCheck.saveFuelRecord')}
                onPress={onSaveFuelLog}
                variant="ghost"
                loading={submitFuelLog.isPending}
                disabled={fuelSaved}
                style={styles.cta}
              />
              {fuelSaved ? (
                <View testID="fuel-log-saved">
                  <Pill label={t('vehicleCheck.fuelSaved')} color={colors.success} bg={colors.successSoft} icon="check" />
                </View>
              ) : null}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  headerSpacer: { flex: 1 },
  body: { padding: 16, gap: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 12, marginBottom: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginTop: 10 },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  cta: { marginTop: 12 },
});
