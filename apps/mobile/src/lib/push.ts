import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { ChequeFlowApiClient } from '@cheque-flow/api-client';

/**
 * Being told about a cheque without opening the app.
 *
 * The reminders existed from the beginning and were only ever a list: the app
 * had to be opened, and the right screen found, before it would say that
 * something was due today. For a product whose entire job is to remember dates
 * on someone's behalf, that is the wrong way round.
 *
 * Nothing here is allowed to fail loudly. A phone can refuse the permission,
 * be a simulator that has no push service at all, or belong to somebody who
 * turned notifications off months ago — none of which is a reason for a sign-in
 * to fail, so every function reports what happened and throws nothing.
 */

/** A notification arriving while the app is open still gets shown. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // Someone looking at the contacts list still wants to know a cheque came
    // due; the alert is how they find out without watching the feed.
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export interface PushRegistration {
  token: string | null;
  /** Why there is no token, for a settings screen that wants to explain. */
  reason: 'ok' | 'denied' | 'unsupported' | 'failed';
}

/**
 * The EAS project a push token is issued against.
 *
 * `extra` is typed as an open record, so this is read rather than asserted.
 * Until the project is linked there is no id, and no token can exist — which
 * is a state the app has to handle rather than crash on.
 */
function easProjectId(): string | null {
  const extra: unknown = Constants.expoConfig?.extra;
  if (typeof extra !== 'object' || extra === null) return null;

  const eas: unknown = (extra as { eas?: unknown }).eas;
  if (typeof eas !== 'object' || eas === null) return null;

  const projectId: unknown = (eas as { projectId?: unknown }).projectId;
  return typeof projectId === 'string' && projectId.length > 0 ? projectId : null;
}

/**
 * Android shows nothing at all without a channel.
 *
 * Not a preference: a notification posted to a device with no channel is
 * dropped by the system, silently, which is the worst of both worlds.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'تنبيهات الشيكات',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/**
 * Asks for permission once, and returns this device's address.
 *
 * Asked at sign-in rather than at first launch: a permission prompt shown
 * before someone knows what the app does is the one they refuse, and iOS only
 * asks once — a refusal there is permanent until they find it in Settings.
 */
export async function obtainPushToken(): Promise<PushRegistration> {
  // A simulator has no push service, and Expo's own client has no project to
  // issue a token against.
  const projectId = easProjectId();
  if (!Constants.isDevice || projectId === null) {
    return { token: null, reason: 'unsupported' };
  }

  try {
    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    const granted = existing.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return { token: null, reason: 'denied' };

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token: token.data, reason: 'ok' };
  } catch {
    return { token: null, reason: 'failed' };
  }
}

/** Registers this phone, if it can be registered. Returns the token it used. */
export async function registerForReminders(api: ChequeFlowApiClient): Promise<string | null> {
  const registration = await obtainPushToken();
  if (!registration.token) return null;

  try {
    await api.registerDevice({
      token: registration.token,
      platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
    });
    return registration.token;
  } catch {
    // The server not hearing about this phone costs a notification, not a
    // session. It will be told again on the next cold start.
    return null;
  }
}

/**
 * Stops reminders reaching this phone.
 *
 * Part of signing out rather than a setting: the next person to hold the phone
 * must not be told about the last person's cheques.
 */
export async function forgetThisDevice(api: ChequeFlowApiClient): Promise<void> {
  try {
    const registration = await obtainPushToken();
    if (registration.token) await api.forgetDevice(registration.token);
  } catch {
    // Nothing here may prevent a sign-out.
  }
}
