'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { LoadingState } from '@cheque-flow/ui';
import type { Permission } from '@cheque-flow/shared-types';

import { useApi, useTranslator } from '@/components/providers';

export interface SessionUser {
  id: string;
  organizationId: string;
  branchId: string | null;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
}

/** Loads the signed-in user and their live permission set. */
export function useSession() {
  const api = useApi();
  return useQuery<SessionUser>({
    queryKey: ['session'],
    queryFn: () => api.me(),
    retry: false,
    staleTime: 60_000,
  });
}

export function usePermission(permission: Permission): boolean {
  const { data } = useSession();
  return data?.permissions.includes(permission) ?? false;
}

/**
 * Blocks a page the signed-in user has no permission for.
 *
 * The navigation already hides these entries, but hiding a link is not a
 * control: the URL can still be typed, and a permission that changes while a
 * tab is open would leave a stale page reachable. The API refuses regardless —
 * this exists so the refusal is a clear message rather than a failed request.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const t = useTranslator();
  const { data, isPending } = useSession();

  if (isPending) return <LoadingState label={t('common.loading')} />;
  if (!data?.permissions.includes(permission)) {
    return (
      <div className="mx-auto max-w-[1440px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-base font-semibold text-slate-800">{t('errors.FORBIDDEN')}</p>
          <p className="mt-2 text-sm text-slate-500">{t('errors.forbiddenHint')}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** Redirects to /login when there is no valid session. */
export function RequireSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const t = useTranslator();
  const { data, isPending, isError } = useSession();

  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  if (isPending) return <LoadingState label={t('common.loading')} />;
  if (!data) return null;

  return <>{children}</>;
}
