import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useApi } from '@/components/providers';
import { registerForReminders } from '@/lib/push';

/**
 * Connects this phone to the reminders the server already keeps.
 *
 * Mounted inside the authenticated layout rather than at the root, so the
 * permission is asked for after someone has signed in and seen what the app
 * is. iOS asks once and once only: a prompt shown at first launch, before the
 * app has earned it, is the one that gets refused permanently.
 *
 * Renders nothing. It is two effects that need somewhere to live.
 */
export function ReminderNotifications() {
  const api = useApi();
  const router = useRouter();

  useEffect(() => {
    // Every mount, not only the first install: the operating system reissues
    // tokens, and the timestamp this refreshes is the server's only evidence
    // that the app is still on the phone.
    void registerForReminders(api);
  }, [api]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      // A notification that only opens the app has made the person do the
      // finding themselves, which is the work it was supposed to save.
      const data: unknown = response.notification.request.content.data;
      if (typeof data !== 'object' || data === null) return;

      const chequeId = (data as { chequeId?: unknown }).chequeId;
      if (typeof chequeId !== 'string' || chequeId.length === 0) return;

      router.push(`/(app)/cheques/${chequeId}`);
    });

    return () => subscription.remove();
  }, [router]);

  return null;
}
