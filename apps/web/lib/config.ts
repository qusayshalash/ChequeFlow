/** Runtime configuration for the dashboard, read from NEXT_PUBLIC_* env vars. */

import { DEFAULT_LOCALE, isLocale, type Locale } from '@cheque-flow/localization';

/** Where the API listens, when it is not spelled out in full. */
const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? '3333';

/**
 * Where the browser sends its API calls.
 *
 * `NEXT_PUBLIC_API_URL` wins whenever it is set — a deployment puts the API on
 * its own host, and that cannot be guessed.
 *
 * Without it the address is taken from the page itself. This used to be a
 * hard-coded `localhost`, which is only true of the machine running the dev
 * server: opening the dashboard from a phone on the same Wi-Fi loaded the page
 * and then asked the *phone* for the API, so every screen came up empty. The
 * host the page was served from is the one machine known to be serving it, and
 * it is right for both — `localhost` on this machine, the LAN address from the
 * phone — with no configuration and nothing to update when the router hands
 * out a different address.
 *
 * Evaluated per call rather than at import: the module is also loaded while
 * rendering on the server, where there is no page to ask.
 */
export function apiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured;

  if (typeof window === 'undefined') return `http://localhost:${API_PORT}/api/v1`;
  return `${window.location.protocol}//${window.location.hostname}:${API_PORT}/api/v1`;
}

export function defaultLocale(): Locale {
  const configured = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;
  return configured && isLocale(configured) ? configured : DEFAULT_LOCALE;
}
