import { AppError, isAppError } from './errors';
import type { Tokens } from './tokenStore';

export interface SessionRefresherDeps {
  readRefreshToken: () => Promise<string | null>;
  refresh: (refreshToken: string) => Promise<Tokens>;
  saveTokens: (tokens: Tokens) => Promise<void>;
  onRefreshed: (accessToken: string) => void;
  onExpired: () => void;
}

export interface SessionRefresher {
  /**
   * New access token, or null if the session was expired (auth rejection / no stored refresh
   * token — `onExpired` has already fired). Rejects with `AppError('network', 0, …)` when the
   * refresh could not be attempted or completed due to a transient failure (offline, 5xx,
   * 429) — the caller must not treat that as session expiry.
   */
  refresh(): Promise<string | null>;
}

// A transient failure (no connectivity, server hiccup, rate-limited) says nothing about
// whether the refresh token itself is still valid — retry later, don't expire the session.
function isTransientStatus(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

// sms-api rotates the refresh token on every use and revokes the old one, so two parallel
// refreshes would revoke each other — every concurrent 401 must await the same attempt.
export function createSessionRefresher(deps: SessionRefresherDeps): SessionRefresher {
  let inFlight: Promise<string | null> | null = null;

  async function run(): Promise<string | null> {
    const refreshToken = await deps.readRefreshToken();
    if (!refreshToken) {
      deps.onExpired();
      return null;
    }
    try {
      const tokens = await deps.refresh(refreshToken);
      await deps.saveTokens(tokens);
      deps.onRefreshed(tokens.accessToken);
      return tokens.accessToken;
    } catch (err) {
      if (isAppError(err) && isTransientStatus(err.status)) {
        // Bootstrap on a dead-zone/flaky connection: the refresh token may still be good,
        // it just couldn't be exchanged right now — never log out for this.
        throw new AppError('network', 0, 'Could not refresh the session');
      }
      // Only an auth rejection ends the session; a network blip mid-route must not log out.
      if (isAppError(err) && err.status >= 400 && err.status < 500) deps.onExpired();
      return null;
    }
  }

  return {
    refresh() {
      if (!inFlight) inFlight = run().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
