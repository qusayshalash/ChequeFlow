import { useQuery } from '@tanstack/react-query';

import { todayIn } from '@cheque-flow/shared-types';

import { useApi } from '@/components/providers';
import { deviceTimeZone } from '@/lib/device-time-zone';

/**
 * The business day, as the organization's time zone has it.
 *
 * Every screen used the UTC day, so from local midnight until two or three in
 * the morning the app showed yesterday: due-today cheques not yet due, overdue
 * ones not yet overdue. Until the session has loaded, the device's own zone is
 * the best guess — almost always the same place, and far closer than UTC.
 */
export function useToday(): string {
  const api = useApi();
  // The same query the rest of the app reads, so this costs no request.
  const session = useQuery({ queryKey: ['session'], queryFn: () => api.me() });
  return todayIn(session.data?.timeZone ?? deviceTimeZone());
}
