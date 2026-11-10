'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  Permission,
  SystemRole,
  type RoleView,
} from '@cheque-flow/shared-types';
import { Badge, Button, ErrorState, LoadingState, SuccessBanner } from '@cheque-flow/ui';

import { IconShield } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';
import { useSession, RequirePermission } from '@/components/session';

/**
 * What each role grants in this organization.
 *
 * Anyone who manages users can read it; only the owner can change it, one
 * role at a time. An admin can already put anyone into any role but the
 * owner's, so if they could also choose what a role grants they could hand
 * themselves the owner's permissions. The owner column is fixed at every
 * permission, so no edit can lock the organization out of this page.
 */
export default function RolesPagePage() {
  return (
    <RequirePermission permission={Permission.USER_MANAGE}>
      <RolesPageBody />
    </RequirePermission>
  );
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key) => b.includes(key));

function RolesPageBody() {
  const api = useApi();
  const t = useTranslator();
  const queryClient = useQueryClient();
  const { data: user } = useSession();
  const mine = new Set(user?.permissions ?? []);
  const isOwner = user?.roles.includes(SystemRole.OWNER) ?? false;

  const query = useQuery({
    queryKey: ['roles', 'permissions'],
    queryFn: () => api.listRolePermissions(),
  });

  /** The role being edited, and its unsaved permissions. */
  const [editing, setEditing] = useState<{ id: string; permissions: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (draft: { id: string; permissions: string[] }) =>
      api.updateRolePermissions(draft.id, draft.permissions),
    onSuccess: () => {
      setEditing(null);
      setError(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      // Someone may have changed a role they hold themselves.
      void queryClient.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiClientError ? caught.messageKey : 'errors.saveFailed');
    },
  });

  if (query.isPending) return <LoadingState label={t('common.loading')} />;
  if (query.isError) {
    return (
      <ErrorState
        title={t('errors.INTERNAL_ERROR')}
        onRetry={() => void query.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const roles = query.data;
  const editedRole = editing ? roles.find((role) => role.id === editing.id) : undefined;

  const toggle = (permission: string) => {
    setSaved(false);
    setEditing((current) =>
      current
        ? {
            ...current,
            permissions: current.permissions.includes(permission)
              ? current.permissions.filter((key) => key !== permission)
              : [...current.permissions, permission],
          }
        : current,
    );
  };

  const isCustom = (role: RoleView) => {
    const defaults = DEFAULT_ROLE_PERMISSIONS[role.name as SystemRole];
    return defaults ? !sameSet(role.permissions, defaults) : false;
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader title={t('nav.roles')} subtitle={t('pageDescription.roles')} />

      <p className="text-sm text-ink-muted">
        {isOwner ? t('rolesPage.hint') : t('rolesPage.ownerOnly')}
      </p>

      {saved ? <SuccessBanner message={t('rolesPage.saved')} /> : null}

      {editing && editedRole ? (
        // Above the table rather than under it: the table scrolls, and the
        // buttons that finish the edit should not scroll away with it.
        <div className="sticky top-2 z-40 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-surface px-4 py-3 shadow-md">
          <p className="me-auto text-sm font-bold text-ink">
            {t('rolesPage.edit')}: {t(`role.${editedRole.name}`)}
          </p>
          {error ? <p className="w-full text-xs text-danger md:w-auto">{t(error)}</p> : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              setEditing({
                id: editedRole.id,
                permissions: [...(DEFAULT_ROLE_PERMISSIONS[editedRole.name as SystemRole] ?? [])],
              })
            }
          >
            {t('rolesPage.reset')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditing(null);
              setError(null);
            }}
          >
            {t('rolesPage.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            loading={save.isPending}
            onClick={() => save.mutate(editing)}
          >
            {t('rolesPage.save')}
          </Button>
        </div>
      ) : null}

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
                {roles.map((role) => (
                  <th
                    key={role.id}
                    scope="col"
                    className={`border-b border-line px-4 py-4 text-center text-xs font-bold ${
                      editing?.id === role.id ? 'bg-primary-soft/60' : ''
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <IconShield width="15" height="15" className="text-ink-muted" />
                      {t(`role.${role.name}`)}
                    </span>
                    {isCustom(role) ? (
                      <Badge tone="warning" className="mt-1.5 block">
                        {t('rolesPage.custom')}
                      </Badge>
                    ) : null}
                    {isOwner && !role.isLocked && !editing ? (
                      <button
                        type="button"
                        className="mt-1.5 block w-full text-xs font-semibold text-primary-ink hover:underline"
                        onClick={() => {
                          setSaved(false);
                          setError(null);
                          setEditing({ id: role.id, permissions: [...role.permissions] });
                        }}
                      >
                        {t('rolesPage.edit')}
                      </button>
                    ) : null}
                    {role.isLocked ? (
                      <span className="mt-1.5 block text-[11px] font-normal text-ink-faint">
                        {t('rolesPage.locked')}
                      </span>
                    ) : null}
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
                    <span className="font-semibold text-ink">{t(`permission.${permission}`)}</span>
                    {mine.has(permission) ? (
                      <Badge tone="success" className="ms-2">
                        {t('rolesPage.youHave')}
                      </Badge>
                    ) : null}
                  </th>
                  {roles.map((role) => {
                    const beingEdited = editing?.id === role.id;
                    const granted = beingEdited
                      ? editing.permissions.includes(permission)
                      : role.permissions.includes(permission);
                    return (
                      <td
                        key={role.id}
                        className={`border-b border-line-soft px-4 py-4 text-center ${
                          beingEdited ? 'bg-primary-soft/30' : ''
                        }`}
                      >
                        {beingEdited ? (
                          <input
                            type="checkbox"
                            className="size-5 cursor-pointer accent-[var(--app-primary)]"
                            checked={granted}
                            onChange={() => toggle(permission)}
                            aria-label={`${t(`permission.${permission}`)} — ${t(`role.${role.name}`)}`}
                          />
                        ) : granted ? (
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
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
