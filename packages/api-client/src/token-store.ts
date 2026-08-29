import type { AuthTokens } from '@cheque-flow/shared-types';

/**
 * Platform-specific token storage.
 *
 * The web app keeps tokens in memory plus an http-only-ish cookie shim, the
 * mobile app uses `expo-secure-store`. The client only depends on this
 * interface, which also makes it trivial to fake in tests.
 */
export interface TokenStore {
  getTokens(): Promise<AuthTokens | null>;
  setTokens(tokens: AuthTokens | null): Promise<void>;
}

/** In-memory store — the default for tests and server-side rendering. */
export class MemoryTokenStore implements TokenStore {
  private tokens: AuthTokens | null = null;

  getTokens(): Promise<AuthTokens | null> {
    return Promise.resolve(this.tokens);
  }

  setTokens(tokens: AuthTokens | null): Promise<void> {
    this.tokens = tokens;
    return Promise.resolve();
  }
}
