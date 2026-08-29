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

/** Use the machine's LAN IP (not localhost) when testing on a real device. */
export const API_URL = readEnv('EXPO_PUBLIC_API_URL') ?? 'http://localhost:3333/api/v1';

export function defaultLocale(): Locale {
  const configured = readEnv('EXPO_PUBLIC_DEFAULT_LOCALE');
  return configured && isLocale(configured) ? configured : DEFAULT_LOCALE;
}
