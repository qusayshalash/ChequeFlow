'use client';

import {
  Permission,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  SystemRole,
} from '@cheque-flow/shared-types';
import { Badge, Card } from '@cheque-flow/ui';

import { PageHeader } from '@/components/page-header';
import { useTranslator } from '@/components/providers';
import { useSession, RequirePermission } from '@/components/session';

/**
 * The RBAC catalogue.
 *
 * Role editing is a phase-2 endpoint; this page shows the seeded default
 * matrix and highlights what the signed-in user actually holds.
 */
export default function RolesPagePage() {
  return (
    <RequirePermission permission={Permission.USER_MANAGE}>
      <RolesPageBody />
    </RequirePermission>
  );
}

function RolesPageBody() {
  const t = useTranslator();
  const { data: user } = useSession();
  const mine = new Set(user?.permissions ?? []);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <PageHeader title={t('nav.roles')} />

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-slate-500">
            <tr>
              <th scope="col" className="p-3 text-start text-xs font-medium">
                {t('nav.roles')}
              </th>
              {Object.values(SystemRole).map((role) => (
                <th key={role} scope="col" className="p-3 text-center text-xs font-medium">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ALL_PERMISSIONS.map((permission) => (
              <tr key={permission}>
                <th scope="row" className="p-3 text-start font-normal text-slate-700">
                  <span className="flex flex-col">
                    <code dir="ltr" className="text-xs text-slate-500">
                      {permission}
                    </code>
                    <span className="text-slate-800">{PERMISSION_DESCRIPTIONS[permission]}</span>
                  </span>
                  {mine.has(permission) ? (
                    <Badge tone="success" className="mt-1">
                      {t('common.yes')}
                    </Badge>
                  ) : null}
                </th>
                {Object.values(SystemRole).map((role) => (
                  <td key={role} className="p-3 text-center">
                    {DEFAULT_ROLE_PERMISSIONS[role].includes(permission) ? '✓' : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
