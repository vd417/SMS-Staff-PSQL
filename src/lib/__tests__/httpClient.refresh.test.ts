import { createHttpClient } from '@/lib/httpClient';
import { AppError } from '@/lib/errors';

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

  it('propagates a transient refresh failure instead of the original 401', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(unauthorized());
    const onUnauthorized = jest.fn(async () => { throw new AppError('network', 0, 'Could not refresh the session'); });
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: () => ({ accessToken: 'a', tenantId: 't' }), fetchImpl, onUnauthorized });
    await expect(http.get('/staff/tasks')).rejects.toMatchObject({ code: 'network' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('replays immediately with no extra rotation when another caller already refreshed the token in flight', async () => {
    let token = 'old';
    let resolveFetch!: (v: unknown) => void;
    const fetchImpl = jest.fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveFetch = r; }))
      .mockResolvedValueOnce(ok({ n: 1 }));
    const onUnauthorized = jest.fn(async () => 'should-not-be-called');
    const http = createHttpClient({ baseUrl: 'http://api', getAuth: () => ({ accessToken: token, tenantId: 't' }), fetchImpl, onUnauthorized });

    const pending = http.get('/staff/tasks');
    // Another concurrent request's 401 already triggered (and completed) a refresh while
    // this request was still in flight with the old token.
    token = 'new';
    resolveFetch(unauthorized());

    await expect(pending).resolves.toEqual({ n: 1 });
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
  });
});
