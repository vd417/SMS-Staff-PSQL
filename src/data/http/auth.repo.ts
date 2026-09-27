import type { AuthRepository } from '@/data/repositories/types';
import type { Session } from '@/data/domain';
import type { HttpClient } from '@/lib/httpClient';
import { authSnapshot } from '@/lib/authSnapshot';
import { AppError } from '@/lib/errors';
import {
  tokenSchema, meSchema, toStaffFromMe, toTenantFromMe, maskIdentifier, buildLoginRequest,
  type TokenWire,
} from './auth.schema';

export function httpAuth(http: HttpClient): AuthRepository {
  const NO_ROLE = 'Your account has no staff app role. Contact your school admin.';

  // /auth/me is [Authorize]: the snapshot must carry the new token before it goes out.
  async function sessionFromTokens(t: TokenWire): Promise<Session> {
    authSnapshot.set({ accessToken: t.access_token, tenantId: null });
    const me = meSchema.parse(await http.get('/auth/me'));
    if (!me.role_key) {
      // Not a staff-app user (teacher/admin, or a designation with no duty role): revoke the
      // tokens just issued rather than leaving them valid, and refuse the session.
      authSnapshot.clear();
      void http.post('/auth/logout', { refresh_token: t.refresh_token }).catch(() => {});
      throw new AppError('no_staff_role', 403, NO_ROLE);
    }
    authSnapshot.set({ accessToken: t.access_token, tenantId: me.tenant_id });
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      user: toStaffFromMe(me, me.role_key),
      tenant: toTenantFromMe(me),
    };
  }

  return {
    requestOtp: async (identifier) => {
      await http.post('/auth/otp/request', { identifier });
      return {
        channel: identifier.includes('@') ? 'email' : 'sms',
        destination: maskIdentifier(identifier),
      };
    },
    // roleKey is unused: the duty role now comes from /auth/me's role_key, never the caller.
    verifyOtp: async (identifier, code, _roleKey) =>
      sessionFromTokens(tokenSchema.parse(await http.post('/auth/otp/verify', { identifier, code }))),
    login: async (identifier, password, _roleKey) =>
      sessionFromTokens(tokenSchema.parse(await http.post('/auth/login', buildLoginRequest(identifier, password)))),
    setPassword: async (password) => {
      await http.post('/auth/set-password', { password });
    },
    // sms-api returns only the rotated pair (TokenResponse) — no user/tenant.
    refresh: async (refreshToken) => {
      const t = tokenSchema.parse(await http.post('/auth/refresh', { refresh_token: refreshToken }));
      return { accessToken: t.access_token, refreshToken: t.refresh_token };
    },
    me: async (previous) => {
      const me = meSchema.parse(await http.get('/auth/me'));
      if (!me.role_key) throw new AppError('no_staff_role', 403, NO_ROLE);
      return toStaffFromMe(me, me.role_key, previous);
    },
    // The backend's [FromBody] RefreshRequest is required — posting with no
    // body 415s. Without a refresh token there's nothing to revoke server-side.
    logout: (refreshToken) =>
      refreshToken ? http.post<void>('/auth/logout', { refresh_token: refreshToken }) : Promise.resolve(),
  };
}
