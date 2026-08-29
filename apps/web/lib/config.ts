/** Runtime configuration for the dashboard, read from NEXT_PUBLIC_* env vars. */

import { DEFAULT_LOCALE, isLocale, type Locale } from '@cheque-flow/localization';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api/v1';

export function defaultLocale(): Locale {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;
  return configured && isLocale(configured) ? configured : DEFAULT_LOCALE;
}
