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
            <thead className="sticky top-0 z-20 bg-subtle/95 text-ink-muted backdrop-blur-sm">
              <tr>
                <th
                  scope="col"
                  className="sticky start-0 z-30 min-w-72 border-b border-line bg-subtle/95 px-5 py-4 text-start text-xs font-bold"
                >
                  {t('rolesPage.permission')}
                </th>
                {Object.values(SystemRole).map((role) => (
                  <th
                    key={role}
                    scope="col"
                    className="border-b border-line px-4 py-4 text-center text-xs font-bold"
                  >
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <IconShield width="15" height="15" className="text-ink-muted" />
                      {t(`role.${role}`)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_PERMISSIONS.map((permission) => (
                <tr key={permission} className="group hover:bg-subtle/70">
                  <th
                    scope="row"
                    className="sticky start-0 z-10 border-b border-line-soft bg-surface px-5 py-4 text-start font-normal text-ink-soft group-hover:bg-subtle"
                  >
                    {/* The name only. The internal key (`cheque.create`) sat above
                        it and told the reader nothing; the badge said "yes"
                        without saying to what. */}
                    <span className="font-semibold text-ink">{t(`permission.${permission}`)}</span>
                    {mine.has(permission) ? (
                      <Badge tone="success" className="ms-2">
                        {t('rolesPage.youHave')}
                      </Badge>
                    ) : null}
                  </th>
                  {Object.values(SystemRole).map((role) => (
                    <td key={role} className="border-b border-line-soft px-4 py-4 text-center">
                      {DEFAULT_ROLE_PERMISSIONS[role].includes(permission) ? (
                        <span
                          className="inline-flex size-7 items-center justify-center rounded-full bg-primary-soft font-bold text-primary-ink ring-1 ring-primary-soft"
                          aria-label={t('common.yes')}
                        >
                          ✓
                        </span>
                      ) : (
                        <span className="text-ink-faint" aria-label={t('common.no')}>
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
