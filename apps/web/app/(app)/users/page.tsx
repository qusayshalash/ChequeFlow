'use client';

import { Card } from '@cheque-flow/ui';

import { PageHeader } from '@/components/page-header';
import { useTranslator } from '@/components/providers';
import { useSession } from '@/components/session';

/**
 * User management is a phase-2 module (the API exposes no user CRUD yet).
 * Until then this page shows the signed-in account and its effective access,
 * which is what the seeded environment needs for verification.
 */
export default function UsersPage() {
  const t = useTranslator();
  const { data: user } = useSession();

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <PageHeader title={t('nav.users')} />

      <Card className="flex flex-col gap-2">
        <p className="text-lg font-medium text-slate-900">{user?.name}</p>
        <p className="text-sm text-slate-600" dir="ltr">
          {user?.email}
        </p>
        <p className="text-sm text-slate-600">
          {t('nav.roles')}: {user?.roles.join('، ')}
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {(user?.permissions ?? []).map((permission) => (
            <li
              key={permission}
              dir="ltr"
              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
            >
              {permission}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
