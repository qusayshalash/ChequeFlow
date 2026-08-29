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
