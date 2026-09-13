import Constants from 'expo-constants';

import { DEFAULT_LOCALE, isLocale, type Locale } from '@cheque-flow/localization';

/**
 * Runtime configuration.
 *
 * `EXPO_PUBLIC_*` variables are inlined by Metro at build time. React Native
 * does not type `process.env`, so it is read through a narrowing helper rather
 * than an `any` cast.
 */
function readEnv(name: string): string | undefined {
  const source: unknown = process.env;
  if (typeof source !== 'object' || source === null) return undefined;
  const value = (source as Record<string, unknown>)[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Where the API listens in development, when the address is derived. */
const DEV_API_PORT = readEnv('EXPO_PUBLIC_API_PORT') ?? '3333';

/**
 * The machine serving this bundle, in development.
 *
 * Expo knows it: the phone had to reach the dev server to get the JavaScript
 * it is running, and `hostUri` is the address it used. Deriving the API from
 * it costs nothing and removes the one piece of configuration that goes stale
 * on its own — the router changes the Mac's address, and a hard-coded IP in
 * `.env` turns into a phone that loads the app and then cannot reach a single
 * endpoint. That happened: 192.168.1.121 became 192.168.1.10 overnight.
 *
 * `undefined` in a real build, where there is no dev server and the address
 * must come from `EXPO_PUBLIC_API_URL`.
 */
function devServerHost(): string | undefined {
  const hostUri: unknown =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;
  if (typeof hostUri !== 'string') return undefined;
  const host = hostUri.split('://').pop()?.split('/')[0]?.split(':')[0];
  return host && host.length > 0 ? host : undefined;
}

/**
 * Where the app sends its API calls.
 *
 * An explicit `EXPO_PUBLIC_API_URL` always wins — a real build talks to a real
 * server. Without one the address follows the dev server, and `localhost` is
 * the last resort, which on a phone means the phone itself.
 */
export const API_URL = (() => {
  const configured = readEnv('EXPO_PUBLIC_API_URL');
  if (configured) return configured;

  const host = devServerHost();
  return `http://${host ?? 'localhost'}:${DEV_API_PORT}/api/v1`;
})();

export function defaultLocale(): Locale {
  const configured = readEnv('EXPO_PUBLIC_DEFAULT_LOCALE');
  return configured && isLocale(configured) ? configured : DEFAULT_LOCALE;
}
