import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_CALENDAR,
  DEFAULT_LOCALE,
  isCalendar,
  isLocale,
  type CalendarPreference,
  type Locale,
} from '@cheque-flow/localization';

const KEY = 'chequeflow.settings';

/**
 * Display preferences the user chooses in the app.
 *
 * These are presentation only — nothing here changes what is stored or sent to
 * the server, so switching calendar or language can never alter a cheque.
 */
export interface AppSettings {
  locale: Locale;
  calendar: CalendarPreference;
  /**
   * Require a fingerprint or face check before the app can be used.
   *
   * Stored rather than kept in memory: a lock that forgets itself when the app
   * restarts is not a lock, and the restart is exactly when it matters.
   */
  biometricLock: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  locale: DEFAULT_LOCALE,
  calendar: DEFAULT_CALENDAR,
  // Off by default: turning it on must be a deliberate choice, made after the
  // user has proved the sensor works on their device.
  biometricLock: false,
};

/** Reads stored preferences, falling back to defaults for anything invalid. */
export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS;

    const record = parsed as Record<string, unknown>;
    const locale = record.locale;
    const calendar = record.calendar;

    return {
      locale: typeof locale === 'string' && isLocale(locale) ? locale : DEFAULT_SETTINGS.locale,
      calendar:
        typeof calendar === 'string' && isCalendar(calendar) ? calendar : DEFAULT_SETTINGS.calendar,
      biometricLock:
        typeof record.biometricLock === 'boolean'
          ? record.biometricLock
          : DEFAULT_SETTINGS.biometricLock,
    };
  } catch {
    // A corrupt settings blob must never stop the app from starting.
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // The choice still applies for this session even if it cannot be stored.
  }
}
