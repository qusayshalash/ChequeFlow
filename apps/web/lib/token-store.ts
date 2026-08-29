import type { AuthTokens } from '@cheque-flow/shared-types';
import type { TokenStore } from '@cheque-flow/api-client';

const STORAGE_KEY = 'chequeflow.session';

/**
 * Browser token store.
 *
 * Tokens are held in memory and mirrored to `localStorage` so a page reload
 * keeps the session. The trade-off (XSS can read the tokens) is accepted for
 * phase 1 and is documented in `docs/architecture-decisions.md`; the planned
 * hardening is to move refresh tokens into an http-only cookie issued by a
 * Next.js route handler.
 */
export class BrowserTokenStore implements TokenStore {
  private cached: AuthTokens | null = null;

  getTokens(): Promise<AuthTokens | null> {
    if (this.cached) return Promise.resolve(this.cached);
    if (typeof window === 'undefined') return Promise.resolve(null);

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      this.cached = raw ? (JSON.parse(raw) as AuthTokens) : null;
    } catch {
      // Corrupt or unavailable storage is treated as "no session".
      this.cached = null;
    }
    return Promise.resolve(this.cached);
  }

  setTokens(tokens: AuthTokens | null): Promise<void> {
    this.cached = tokens;
    if (typeof window === 'undefined') return Promise.resolve();

    try {
      if (tokens) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private browsing modes can refuse writes; the in-memory copy still works.
    }
    return Promise.resolve();
  }
}
