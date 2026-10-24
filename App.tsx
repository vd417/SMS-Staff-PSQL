import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform, Pressable, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora';
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { RootNavigator } from '@/navigation/RootNavigator';
import { AppProviders } from '@/providers/AppProviders';
import { initI18n } from '@/i18n';

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.loading}>
        <Text style={styles.offlineTitle}>No internet</Text>
        <Text style={styles.offlineBody}>The app is still open. Connect and try again.</Text>
        <Pressable onPress={() => this.setState({ failed: false })} style={styles.retry}>
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

export default function App() {
  // Load Sora (display) + Manrope (body) together via expo-font's useFonts.
  const [fontsLoaded, fontError] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    // Even if init rejects, unblock the UI — i18n falls back to English.
    initI18n()
      .then(() => setI18nReady(true))
      .catch(() => setI18nReady(true));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.body.style.backgroundColor = '#126954';
  }, []);

  // A font-load failure should degrade to system fonts, not hang forever.
  const ready = (fontsLoaded || !!fontError) && i18nReady;
  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#0E5C4A" />
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={styles.flex}>
        <View style={Platform.OS === 'web' ? styles.webOuter : styles.flex}>
          <View style={Platform.OS === 'web' ? styles.webColumn : styles.flex}>
            <SafeAreaProvider>
              <AppProviders>
                <NavigationContainer>
                  <StatusBar style="auto" />
                  <RootNavigator />
                </NavigationContainer>
              </AppProviders>
            </SafeAreaProvider>
          </View>
        </View>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  webOuter: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#126954',
  },
  webColumn: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#F2EEE4',
    overflow: 'hidden',
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EEE4', padding: 24, gap: 8 },
  offlineTitle: { fontSize: 20, fontWeight: '700', color: '#1A2E26' },
  offlineBody: { fontSize: 14, color: '#4E6158', textAlign: 'center' },
  retry: { marginTop: 12, backgroundColor: '#0E5C4A', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  retryLabel: { color: '#FFFFFF', fontWeight: '700' },
});
