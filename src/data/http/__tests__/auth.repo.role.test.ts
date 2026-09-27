import { httpAuth } from '@/data/http/auth.repo';
import { buildLoginRequest } from '@/data/http/auth.schema';
import { authSnapshot } from '@/lib/authSnapshot';
import type { HttpClient } from '@/lib/httpClient';

function fakeHttp(me: Record<string, unknown>) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const http: HttpClient = {
    get: async <T>(path: string) => { calls.push({ method: 'GET', path }); return me as T; },
    post: async <T>(path: string, body?: unknown) => {
      calls.push({ method: 'POST', path, body });
      return (path === '/auth/logout' ? undefined : { access_token: 'at', refresh_token: 'rt' }) as T;
    },
    patch: async <T>() => undefined as T,
    delete: async <T>() => undefined as T,
  };
  return { http, calls };
}

describe('login wire', () => {
  it('never sends role', () => {
    expect(buildLoginRequest('a@b.com', 'pw')).toEqual({ email: 'a@b.com', password: 'pw' });
    expect(buildLoginRequest('9876543210', 'pw')).toEqual({ phone: '9876543210', password: 'pw' });
  });

  it('takes the duty role from /auth/me, not the login screen', async () => {
    const { http, calls } = fakeHttp({ id: 'u', tenant_id: 't', role_key: 'conductor' });
    const s = await httpAuth(http).login('a@b.com', 'pw', 'driver');
    expect(s.user.roleKey).toBe('conductor');
    expect(calls[0].body).toEqual({ email: 'a@b.com', password: 'pw' });
  });

  it('refuses an account with no staff role, revokes its tokens and clears the snapshot', async () => {
    const { http, calls } = fakeHttp({ id: 'u', tenant_id: 't', role_key: null });
    await expect(httpAuth(http).login('a@b.com', 'pw', 'driver')).rejects.toMatchObject({ code: 'no_staff_role', status: 403 });
    expect(calls.some((c) => c.path === '/auth/logout')).toBe(true);
    expect(authSnapshot.get().accessToken).toBeNull();
  });

  it('refuses it on OTP verify too', async () => {
    const { http } = fakeHttp({ id: 'u', tenant_id: 't' });
    await expect(httpAuth(http).verifyOtp('a@b.com', '123456', 'driver')).rejects.toMatchObject({ code: 'no_staff_role' });
  });

  it('refuses it on bootstrap /auth/me', async () => {
    const { http } = fakeHttp({ id: 'u', tenant_id: 't', role_key: null });
    await expect(httpAuth(http).me()).rejects.toMatchObject({ code: 'no_staff_role' });
  });
});
