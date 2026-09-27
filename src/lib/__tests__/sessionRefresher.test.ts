import { createSessionRefresher } from '@/lib/sessionRefresher';
import { AppError } from '@/lib/errors';

function deps(overrides: Partial<Parameters<typeof createSessionRefresher>[0]> = {}) {
  return {
    readRefreshToken: jest.fn().mockResolvedValue('rt-1'),
    refresh: jest.fn().mockResolvedValue({ accessToken: 'at-2', refreshToken: 'rt-2' }),
    saveTokens: jest.fn().mockResolvedValue(undefined),
    onRefreshed: jest.fn(),
    onExpired: jest.fn(),
    ...overrides,
  };
}

describe('createSessionRefresher', () => {
  it('rotates tokens and returns the new access token', async () => {
    const d = deps();
    await expect(createSessionRefresher(d).refresh()).resolves.toBe('at-2');
    expect(d.refresh).toHaveBeenCalledWith('rt-1');
    expect(d.saveTokens).toHaveBeenCalledWith({ accessToken: 'at-2', refreshToken: 'rt-2' });
    expect(d.onRefreshed).toHaveBeenCalledWith('at-2');
  });

  it('shares one in-flight refresh between concurrent callers (rotation would revoke a second one)', async () => {
    let resolve!: (v: { accessToken: string; refreshToken: string }) => void;
    const d = deps({ refresh: jest.fn(() => new Promise((r) => { resolve = r; })) });
    const r = createSessionRefresher(d);
    const a = r.refresh();
    const b = r.refresh();
    await Promise.resolve();
    resolve({ accessToken: 'at-2', refreshToken: 'rt-2' });
    await expect(Promise.all([a, b])).resolves.toEqual(['at-2', 'at-2']);
    expect(d.refresh).toHaveBeenCalledTimes(1);
  });

  it('expires the session when the server rejects the refresh token', async () => {
    const d = deps({ refresh: jest.fn().mockRejectedValue(new AppError('invalid_token', 401, 'refresh token invalid')) });
    await expect(createSessionRefresher(d).refresh()).resolves.toBeNull();
    expect(d.onExpired).toHaveBeenCalledTimes(1);
  });

  it('does not expire the session on a network failure, but rejects so the caller can retry', async () => {
    const d = deps({ refresh: jest.fn().mockRejectedValue(new AppError('network', 0, 'offline')) });
    await expect(createSessionRefresher(d).refresh()).rejects.toMatchObject({ code: 'network' });
    expect(d.onExpired).not.toHaveBeenCalled();
  });

  it('does not expire the session on a 503, but rejects so the caller can retry', async () => {
    const d = deps({ refresh: jest.fn().mockRejectedValue(new AppError('http_error', 503, 'down')) });
    await expect(createSessionRefresher(d).refresh()).rejects.toMatchObject({ code: 'network' });
    expect(d.onExpired).not.toHaveBeenCalled();
  });

  it('does not expire the session on a 429, but rejects so the caller can retry', async () => {
    const d = deps({ refresh: jest.fn().mockRejectedValue(new AppError('too_many_requests', 429, 'slow down')) });
    await expect(createSessionRefresher(d).refresh()).rejects.toMatchObject({ code: 'network' });
    expect(d.onExpired).not.toHaveBeenCalled();
  });

  it('expires when there is no refresh token stored', async () => {
    const d = deps({ readRefreshToken: jest.fn().mockResolvedValue(null) });
    await expect(createSessionRefresher(d).refresh()).resolves.toBeNull();
    expect(d.onExpired).toHaveBeenCalled();
  });
});
