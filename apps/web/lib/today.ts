'use client';

import { todayIn } from '@cheque-flow/shared-types';

import { useSession } from '@/components/session';

/**
 * The business day, as the organization's time zone has it.
 *
 * Every screen used the UTC day, so from local midnight until two or three in
 * the morning the app showed yesterday: due-today cheques not yet due, overdue
 * ones not yet overdue. Until the session has loaded, the device's own zone is
 * the best guess — almost always the same place, and far closer than UTC.
 */
export function useToday(): string {
  const { data } = useSession();
  return todayIn(data?.timeZone ?? deviceTimeZone());
}

/** The zone the browser is set to, or UTC if it will not say. */
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
