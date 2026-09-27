import { isAppError } from './errors';
import type { Tokens } from './tokenStore';

export interface SessionRefresherDeps {
  readRefreshToken: () => Promise<string | null>;
  refresh: (refreshToken: string) => Promise<Tokens>;
  saveTokens: (tokens: Tokens) => Promise<void>;
  onRefreshed: (accessToken: string) => void;
  onExpired: () => void;
}

export interface SessionRefresher {
  /** New access token, or null if the session could not be refreshed. */
  refresh(): Promise<string | null>;
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
      // Only an auth rejection ends the session; a network blip mid-route must not log out.
      if (isAppError(err) && err.status >= 400 && err.status < 500 && err.status !== 429) deps.onExpired();
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
