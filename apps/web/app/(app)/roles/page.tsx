'use client';

import {
  Permission,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  SystemRole,
} from '@cheque-flow/shared-types';
import { Badge } from '@cheque-flow/ui';

import { IconShield } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
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
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader title={t('nav.roles')} subtitle={t('pageDescription.roles')} />

      <Panel bodyClassName="">
        <div className="overflow-auto">
          <table className="w-full min-w-[920px] border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-20 bg-slate-50/95 text-slate-500 backdrop-blur-sm">
              <tr>
                <th
                  scope="col"
                  className="sticky start-0 z-30 min-w-72 border-b border-slate-200 bg-slate-50/95 px-5 py-4 text-start text-xs font-bold"
                >
                  {t('nav.roles')}
                </th>
                {Object.values(SystemRole).map((role) => (
                  <th
                    key={role}
                    scope="col"
                    className="border-b border-slate-200 px-4 py-4 text-center text-xs font-bold"
                  >
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <IconShield width="15" height="15" className="text-slate-400" />
                      {t(`role.${role}`)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_PERMISSIONS.map((permission) => (
                <tr key={permission} className="group hover:bg-slate-50/70">
                  <th
                    scope="row"
                    className="sticky start-0 z-10 border-b border-slate-100 bg-white px-5 py-4 text-start font-normal text-slate-700 group-hover:bg-slate-50"
                  >
                    <span className="flex flex-col">
                      <code dir="ltr" className="text-xs text-slate-500">
                        {permission}
                      </code>
                      <span className="mt-1 font-semibold text-slate-800">
                        {t(`permission.${permission}`)}
                      </span>
                    </span>
                    {mine.has(permission) ? (
                      <Badge tone="success" className="mt-1">
                        {t('common.yes')}
                      </Badge>
                    ) : null}
                  </th>
                  {Object.values(SystemRole).map((role) => (
                    <td key={role} className="border-b border-slate-100 px-4 py-4 text-center">
                      {DEFAULT_ROLE_PERMISSIONS[role].includes(permission) ? (
                        <span
                          className="inline-flex size-7 items-center justify-center rounded-full bg-teal-50 font-bold text-teal-700 ring-1 ring-teal-100"
                          aria-label={t('common.yes')}
                        >
                          ✓
                        </span>
                      ) : (
                        <span className="text-slate-300" aria-label={t('common.no')}>
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
