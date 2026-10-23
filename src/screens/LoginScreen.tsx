// src/screens/LoginScreen.tsx — production Login screen
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useTheme } from '@/theme';
import { TextScale } from '@/theme/typography';
import { SUPPORTED_LANGUAGES, setLanguage, i18n, type LanguageCode } from '@/i18n';
import { useRequestOtp, useActivateWithOtp, useLogin } from '@/features/auth/hooks';
import { authErrorMessage } from '@/features/auth/authErrors';
import { isAppError } from '@/lib/errors';
import {
  Btn,
  BrandCap,
  LanguagePicker,
  TextField,
} from '@/components/ui';
import { Icon } from '@/components/icons';

type Mode = 'password' | 'otp-request' | 'otp-activate';
const MIN_PASSWORD_LEN = 8;

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/);
const emailSchema = z.string().email();

function stripPhone(raw: string): string {
  return raw.replace(/\s/g, '');
}

function isValidPhone(raw: string): boolean {
  return phoneSchema.safeParse(stripPhone(raw)).success;
}

function isValidEmail(raw: string): boolean {
  return emailSchema.safeParse(raw.trim()).success;
}

function looksLikeEmail(raw: string): boolean {
  return /[a-zA-Z@]/.test(raw);
}

function normalizeIdentifier(raw: string): string {
  const trimmed = raw.trim();
  return looksLikeEmail(trimmed) ? trimmed : stripPhone(trimmed);
}

function isValidIdentifier(raw: string): boolean {
  return looksLikeEmail(raw) ? isValidEmail(raw) : isValidPhone(raw);
}

export const LoginScreen = () => {
  const { t } = useTranslation();
  const { colors, roleKey } = useTheme();
  const login = useLogin();
  const requestOtp = useRequestOtp();
  const activate = useActivateWithOtp();

  const [mode, setMode] = useState<Mode>('password');
  const [identifierInput, setIdentifierInput] = useState('');
  const [password, setPasswordInput] = useState('');
  const [code, setCode] = useState('');
  const [destination, setDestination] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupTouched, setSetupTouched] = useState(false);

  const identifier = normalizeIdentifier(identifierInput);
  const identifierValid = isValidIdentifier(identifierInput);
  const showIdentifierError = touched && !identifierValid && identifier.length > 0;
  const identifierError = looksLikeEmail(identifierInput) ? t('login.invalidEmail') : t('login.invalidPhone');
  const passwordValid = password.length >= MIN_PASSWORD_LEN;

  const loginErr = login.error ? authErrorMessage(login.error) : null;
  const requestErr = requestOtp.error ? authErrorMessage(requestOtp.error) : null;
  const activateErr = activate.error ? authErrorMessage(activate.error) : null;

  const currentLang = i18n.language as LanguageCode;
  const languageNative =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.native ?? 'English';

  function handleSelectLanguage(code: LanguageCode) {
    void setLanguage(code);
    setLangOpen(false);
  }

  function resetOtpState() {
    setCode('');
    setDestination('');
    setNewPassword('');
    setConfirmPassword('');
    setSetupTouched(false);
    requestOtp.reset();
    activate.reset();
  }

  function enterOtpSetup() {
    setMode('otp-request');
    resetOtpState();
    login.reset();
  }

  function backToPasswordLogin() {
    setMode('password');
    resetOtpState();
  }

  function handleLogin() {
    login.mutate({ identifier, password, roleKey }, {
      onError: (err) => {
        if (isAppError(err) && err.code === 'password_not_set') {
          enterOtpSetup();
        }
      },
    });
  }

  function handleSendOtp() {
    activate.reset();
    setCode('');
    requestOtp.mutate(identifier, {
      onSuccess: (challenge) => {
        setDestination(challenge.destination);
        setMode('otp-activate');
      },
    });
  }

  function handleChangeIdentifierInSetup() {
    setMode('otp-request');
    resetOtpState();
  }

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const newPasswordValid = newPassword.length >= MIN_PASSWORD_LEN;
  const codeValid = code.length === 6;
  const showMismatch = setupTouched && confirmPassword.length > 0 && !passwordsMatch;
  const showTooShort = setupTouched && newPassword.length > 0 && !newPasswordValid;

  function handleActivate() {
    setSetupTouched(true);
    if (!codeValid || !newPasswordValid || !passwordsMatch) return;
    activate.mutate({ identifier, code, roleKey, password: newPassword });
  }

  const accent = colors.primary;

  // Shared across both branches below so the language picker overlay is always
  // reachable, regardless of which screen (login vs. set-password) is showing.
  const languagePicker = (
    <LanguagePicker
      visible={langOpen}
      current={currentLang}
      onSelect={handleSelectLanguage}
      onClose={() => setLangOpen(false)}
    />
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.bg }]}
      edges={['left', 'right', 'bottom']}
    >
      {languagePicker}

      <BrandCap
        onPressLanguage={() => setLangOpen(true)}
        languageNative={languageNative}
      />

      <KeyboardAvoidingView
        style={styles.scroll}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.greetingBlock}>
          <Text style={[TextScale.hero, { color: colors.ink }]}>
            {t('login.greeting')}
          </Text>
          <Text style={[TextScale.body, { color: colors.inkSoft }]}>
            {mode === 'otp-activate'
              ? t('login.otpActivateSubtitle')
              : mode === 'otp-request'
                ? t('login.otpSetupSubtitle')
                : t('login.subtitle')}
          </Text>
        </View>

        <TextField
          testID="identifier-input"
          value={identifierInput}
          onChangeText={(v) => { setIdentifierInput(v); setTouched(true); }}
          accent={accent}
          icon={looksLikeEmail(identifierInput) ? 'mail' : 'phone'}
          placeholder={t('login.mobileOrEmail')}
          keyboardType="email-address"
          autoCapitalize="none"
          error={showIdentifierError ? identifierError : undefined}
        />

        {mode === 'password' && (
          <>
            <TextField
              testID="password-input"
              value={password}
              onChangeText={setPasswordInput}
              accent={accent}
              icon="lock"
              placeholder={t('login.password')}
              secureTextEntry
            />
            {loginErr && (
              <Text style={[TextScale.caption, { color: colors.danger }]}>{loginErr}</Text>
            )}

            <Btn
              testID="login-cta"
              label={t('login.login')}
              onPress={handleLogin}
              loading={login.isPending}
              disabled={!identifierValid || !passwordValid}
              accent={accent}
            />

            <Pressable testID="first-time-link" onPress={enterOtpSetup}>
              <Text style={[TextScale.button, { color: accent }]}>{t('login.firstTimeOrForgot')}</Text>
            </Pressable>
          </>
        )}

        {mode === 'otp-request' && (
          <>
            {requestErr && (
              <Text style={[TextScale.caption, { color: colors.danger }]}>{requestErr}</Text>
            )}
            <Btn
              testID="send-otp-cta"
              label={t('login.sendOtp')}
              onPress={handleSendOtp}
              loading={requestOtp.isPending}
              disabled={!identifierValid}
              accent={accent}
            />
            <Pressable testID="back-to-password-link" onPress={backToPasswordLogin}>
              <Text style={[TextScale.button, { color: accent }]}>{t('login.backToPasswordLogin')}</Text>
            </Pressable>
          </>
        )}

        {mode === 'otp-activate' && (
          <>
            <Text style={[TextScale.caption, styles.codeSentText, { color: colors.inkSoft }]}>
              {t('login.codeSentTo', { destination })}
            </Text>
            <TextField
              testID="otp-input"
              value={code}
              onChangeText={setCode}
              accent={accent}
              icon="keypad"
              placeholder={t('login.enterCode')}
              keyboardType="number-pad"
              maxLength={6}
            />
            <TextField
              testID="set-password-new-input"
              value={newPassword}
              onChangeText={(v) => { setNewPassword(v); setSetupTouched(true); }}
              accent={accent}
              icon="lock"
              placeholder={t('setPassword.newPassword')}
              secureTextEntry
              error={showTooShort ? t('setPassword.tooShort') : undefined}
            />
            <TextField
              testID="set-password-confirm-input"
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); setSetupTouched(true); }}
              accent={accent}
              icon="lock"
              placeholder={t('setPassword.confirmPassword')}
              secureTextEntry
              error={showMismatch ? t('setPassword.mismatch') : undefined}
            />
            {activateErr && (
              <Text style={[TextScale.caption, { color: colors.danger }]}>{activateErr}</Text>
            )}

            <Btn
              testID="activate-cta"
              label={t('login.verifyAndCreate')}
              onPress={handleActivate}
              loading={activate.isPending}
              disabled={!codeValid || !newPasswordValid || !passwordsMatch}
              accent={accent}
            />

            <View style={styles.linksRow}>
              <Pressable onPress={handleSendOtp} disabled={requestOtp.isPending}>
                <Text style={[TextScale.button, { color: accent }]}>{t('login.resend')}</Text>
              </Pressable>
              <Pressable onPress={handleChangeIdentifierInSetup}>
                <Text style={[TextScale.button, { color: accent }]}>{t('login.change')}</Text>
              </Pressable>
            </View>
          </>
        )}

        <View style={styles.footer}>
          <Icon name="lock" size={14} color={colors.inkFaint} strokeWidth={2} />
          <Text style={[TextScale.caption, { color: colors.inkFaint }]}>
            {t('login.securedBy')}
          </Text>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 48,
    gap: 20,
  },
  greetingBlock: {
    gap: 6,
  },
  codeSentText: {
    marginTop: -8,
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
});
