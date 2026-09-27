import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { env } from '@/config/env';
import { createHttpClient } from '@/lib/httpClient';
import { authSnapshot } from '@/lib/authSnapshot';
import { tokenStore } from '@/lib/tokenStore';
import { sessionEvents } from '@/lib/sessionEvents';
import { createSessionRefresher } from '@/lib/sessionRefresher';
import { createStore } from '@/data/mock/store';
import { createMockRepositories, createHttpRepositories } from '@/data/repositories/factory';
import { RepositoryProvider } from '@/data/repositories/RepositoryContext';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ThemeProvider } from '@/theme';
import { ToastProvider } from '@/components/ui';
import type { Repositories } from '@/data/repositories/types';

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [repositories, setRepositories] = useState<Repositories | null>(null);

  useEffect(() => {
    (async () => {
      // Production always uses HTTP repos (env.DATA_SOURCE is forced live there).
      // Mock AsyncStorage SoT is allowed only when DATA_SOURCE=mock in development.
      if (env.DATA_SOURCE === 'live') {
        // The refresher needs the auth repo, which needs the http client, which needs the
        // refresher — resolve the cycle through a holder filled in right below.
        const holder: { repos?: Repositories } = {};
        const refresher = createSessionRefresher({
          readRefreshToken: async () => (await tokenStore.read())?.refreshToken ?? null,
          refresh: (rt) => holder.repos!.auth.refresh(rt),
          saveTokens: (t) => tokenStore.save(t),
          onRefreshed: (accessToken) => authSnapshot.set({ ...authSnapshot.get(), accessToken }),
          onExpired: () => sessionEvents.emitExpired(),
        });
        const http = createHttpClient({
          baseUrl: env.API_BASE_URL,
          getAuth: () => authSnapshot.get(),
          onUnauthorized: () => refresher.refresh(),
        });
        holder.repos = createHttpRepositories(http);
        setRepositories(holder.repos);
      } else {
        const store = await createStore();
        setRepositories(createMockRepositories(store));
      }
    })();
  }, []);

  if (!repositories) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#0E5C4A" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RepositoryProvider repositories={repositories}>
          <AuthProvider><ToastProvider>{children}</ToastProvider></AuthProvider>
        </RepositoryProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EEE4' },
});
