import * as SecureStore from 'expo-secure-store';

import type { TokenStore } from '@cheque-flow/api-client';
import type { AuthTokens } from '@cheque-flow/shared-types';

const KEY = 'chequeflow.session';

/**
 * Tokens live in the device keychain / Android keystore — never in
 * AsyncStorage, which is world-readable on a rooted device.
 */
export class SecureTokenStore implements TokenStore {
  private cached: AuthTokens | null = null;

  async getTokens(): Promise<AuthTokens | null> {
    if (this.cached) return this.cached;
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      this.cached = raw ? (JSON.parse(raw) as AuthTokens) : null;
    } catch {
      this.cached = null;
    }
    return this.cached;
  }

  async setTokens(tokens: AuthTokens | null): Promise<void> {
    this.cached = tokens;
    try {
      if (tokens) await SecureStore.setItemAsync(KEY, JSON.stringify(tokens));
      else await SecureStore.deleteItemAsync(KEY);
    } catch {
      // A keychain failure must not crash the app; the in-memory copy still works.
    }
  }
}
