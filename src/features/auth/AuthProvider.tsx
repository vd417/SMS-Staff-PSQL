import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { Session } from '@/data/domain';
import { ROLES, type Role } from '@/theme/roles';
import type { OtpChallenge } from '@/data/repositories/types';
import { tokenStore } from '@/lib/tokenStore';
import { asyncStore } from '@/lib/asyncStore';
import { authSnapshot } from '@/lib/authSnapshot';
import { queryClient } from '@/lib/queryClient';
import { sessionEvents } from '@/lib/sessionEvents';
import { isAppError } from '@/lib/errors';
import { useRepositories } from '@/data/repositories/RepositoryContext';
import { useTheme } from '@/theme';

const SESSION_KEY = 'sms.session';

type Status = 'loading' | 'authenticated' | 'unauthenticated';
interface AuthValue {
  status: Status;
  session: Session | null;
  requestOtp: (identifier: string) => Promise<OtpChallenge>;
  /** First-time / forgot-password activation in one step: verify the OTP (which
   *  issues live tokens), set the chosen password with them, then establish the
   *  session. The OTP entry and password creation live on a single screen. */
  activateWithOtp: (identifier: string, code: string, roleKey: Role, password: string) => Promise<void>;
  signInWithPassword: (identifier: string, password: string, roleKey: Role) => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const repos = useRepositories();
  const { setRole } = useTheme();
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<Session | null>(null);

  // The client-tapped role tile on the login screen is only a preview/hint —
  // the session's roleKey (ultimately sourced from Staff.Role on the backend)
  // is the authoritative session identity and must always win once a session
  // is actually established. A session with no roleKey (e.g. a non-staff test
  // account) leaves the theme's current role untouched rather than crashing
  // or guessing.
  const applyRoleFromSession = useCallback((s: Session) => {
    const roleKey = s.user.roleKey;
    if (roleKey && ROLES[roleKey]) setRole(roleKey);
  }, [setRole]);

  useEffect(() => {
    (async () => {
      try {
        const tokens = await tokenStore.read();
        const stored = await asyncStore.get<Session>(SESSION_KEY);
        if (!tokens || !stored) {
          if (tokens) await tokenStore.clear();
          setStatus('unauthenticated');
          return;
        }
        try {
          // /auth/me is [Authorize] — the snapshot must carry the stored token
          // before this call goes out, or it's sent with no Authorization header
          // and 401s. tokens (SecureStore) take precedence over the AsyncStorage
          // snapshot, so a mid-session token refresh is honoured even if the
          // stored session is stale.
          authSnapshot.set({ accessToken: tokens.accessToken, tenantId: stored.tenant.id });
          // Real /auth/me has no concept of driver/conductor/etc, so pass the
          // stored user through — me() preserves roleKey/dutyPost/rating/shift/
          // timing from it and only refreshes the fields the backend does return.
          const user = await repos.auth.me(stored.user);
          // /auth/me may have triggered a silent refresh that rotated the pair — re-read it.
          const latest = (await tokenStore.read()) ?? tokens;
          const rehydrated: Session = { ...stored, ...latest, user };
          authSnapshot.set({ accessToken: rehydrated.accessToken, tenantId: rehydrated.tenant.id });
          applyRoleFromSession(rehydrated);
          setSession(rehydrated);
          setStatus('authenticated');
        } catch (err) {
          if (isAppError(err) && err.code === 'network') {
            // Offline cold start (driver in a dead zone): keep the stored session; requests
            // retry once connectivity returns. Only an auth rejection logs out.
            const offline: Session = { ...stored, ...tokens };
            authSnapshot.set({ accessToken: offline.accessToken, tenantId: offline.tenant.id });
            applyRoleFromSession(offline);
            setSession(offline);
            setStatus('authenticated');
            return;
          }
          await tokenStore.clear();
          await asyncStore.remove(SESSION_KEY);
          setStatus('unauthenticated');
        }
      } catch {
        // Storage unavailable or any other unexpected bootstrap failure must never
        // wedge the app on the loading splash — fail safe to the Login screen.
        setStatus('unauthenticated');
      }
    })();
  }, [repos, applyRoleFromSession]);

  // The refresh token was rejected (revoked / expired after 30 days): drop to Login.
  useEffect(() => sessionEvents.onExpired(() => {
    void tokenStore.clear();
    void asyncStore.remove(SESSION_KEY);
    authSnapshot.clear();
    queryClient.clear();
    setSession(null);
    setStatus('unauthenticated');
  }), []);

  const establishSession = useCallback(async (s: Session) => {
    await tokenStore.save({ accessToken: s.accessToken, refreshToken: s.refreshToken });
    await asyncStore.set(SESSION_KEY, s);
    authSnapshot.set({ accessToken: s.accessToken, tenantId: s.tenant.id });
    applyRoleFromSession(s);
    setSession(s);
    setStatus('authenticated');
  }, [applyRoleFromSession]);

  const requestOtp = useCallback(
    (identifier: string) => repos.auth.requestOtp(identifier),
    [repos],
  );

  // First-time / forgot-password activation in one step. Verifying the OTP
  // issues live access + refresh tokens; the snapshot must carry the new access
  // token before set-password goes out (it's an [Authorize] call). Only once the
  // password is set do we establish the session and flip status to
  // 'authenticated' — so a half-finished activation never leaves the user logged
  // in without a password. If set-password fails the error propagates to the
  // caller and no local session is stored; the user stays on the activation
  // screen to retry.
  const activateWithOtp = useCallback(
    async (identifier: string, code: string, roleKey: Role, password: string) => {
      const s = await repos.auth.verifyOtp(identifier, code, roleKey);
      authSnapshot.set({ accessToken: s.accessToken, tenantId: s.tenant.id });
      await repos.auth.setPassword(password);
      await establishSession(s);
    },
    [repos, establishSession],
  );

  const signInWithPassword = useCallback(
    async (identifier: string, password: string, roleKey: Role) => {
      const s = await repos.auth.login(identifier, password, roleKey);
      await establishSession(s);
    },
    [repos, establishSession],
  );

  const signOut = useCallback(async () => {
    try {
      // The stored pair is authoritative — it may have been rotated since sign-in.
      const current = (await tokenStore.read())?.refreshToken ?? session?.refreshToken ?? null;
      await repos.auth.logout(current);
    } finally {
      await tokenStore.clear();
      await asyncStore.remove(SESSION_KEY);
      authSnapshot.clear();
      queryClient.clear();
      setSession(null);
      setStatus('unauthenticated');
    }
  }, [repos, session]);

  const value = useMemo<AuthValue>(
    () => ({
      status, session,
      requestOtp, activateWithOtp, signInWithPassword, signOut,
    }),
    [status, session, requestOtp, activateWithOtp, signInWithPassword, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Context-safe: returns 'anon' when there is no AuthProvider (used by query keys).
export function useTenantId(): string {
  const ctx = useContext(AuthContext);
  return ctx?.session?.tenant.id ?? 'anon';
}
