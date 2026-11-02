/**
 * The zone the phone is set to, or UTC if it will not say.
 *
 * On its own, with no imports, because plain modules such as the capture
 * upload need it too and must not pull React and the app's providers in
 * behind them.
 */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
