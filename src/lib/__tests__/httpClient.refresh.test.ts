import { createHttpClient } from '@/lib/httpClient';

const ok = (data: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve({ data }) });
const unauthorized = () => ({ ok: false, status: 401, json: () => Promise.resolve({ error: { code: 'unauthorized', message: 'x' } }) });

describe('httpClient 401 handling', () => {
  it('refreshes once and replays the request with the new token', async () => {
    let token = 'old';
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(ok({ n: 1 }));
    const onUnauthorized = jest.fn(async () => { token = 'new'; return 'new'; });
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: () => ({ accessToken: token, tenantId: 't' }), fetchImpl, onUnauthorized });

    await expect(http.get('/staff/tasks')).resolves.toEqual({ n: 1 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
  });

  it('gives up after one replay', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(unauthorized());
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: () => ({ accessToken: 'a', tenantId: 't' }), fetchImpl, onUnauthorized: async () => 'b' });
    await expect(http.get('/staff/tasks')).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rethrows the 401 when the refresh yields no token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(unauthorized());
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: () => ({ accessToken: 'a', tenantId: 't' }), fetchImpl, onUnauthorized: async () => null });
    await expect(http.get('/staff/tasks')).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(['/auth/login', '/auth/refresh', '/auth/otp/verify', '/auth/logout'])('never refreshes for %s', async (path) => {
    const fetchImpl = jest.fn().mockResolvedValue(unauthorized());
    const onUnauthorized = jest.fn(async () => 'b');
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: () => ({ accessToken: 'a', tenantId: null }), fetchImpl, onUnauthorized });
    await expect(http.post(path, {})).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('does refresh for /auth/me (bootstrap with an expired access token)', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(ok({ id: 'u' }));
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: () => ({ accessToken: 'a', tenantId: null }), fetchImpl, onUnauthorized: async () => 'b' });
    await expect(http.get('/auth/me')).resolves.toEqual({ id: 'u' });
  });
});
