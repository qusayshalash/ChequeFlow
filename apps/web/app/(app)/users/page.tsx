'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { Permission, SystemRole, UserStatus, type UserView } from '@cheque-flow/shared-types';
import { createUserSchema } from '@cheque-flow/validation';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  SuccessBanner,
  inputClassName,
} from '@cheque-flow/ui';

import { DataTable } from '@/components/data-table';
import { IconClose, IconPlus } from '@/components/icons';
import { FilterSearch } from '@/components/filter-search';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { RequirePermission, useSession } from '@/components/session';
import { formatDateTime } from '@/lib/format';

interface FormState {
  name: string;
  email: string;
  password: string;
  role: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  password: '',
  role: SystemRole.DATA_ENTRY,
};

export default function UsersPage() {
  return (
    <RequirePermission permission={Permission.USER_MANAGE}>
      <UsersManager />
    </RequirePermission>
  );
}

function UsersManager() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const users = useQuery({
    queryKey: ['users', search],
    queryFn: () => api.listUsers({ pageSize: 100, ...(search ? { search } : {}) }),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  const create = useMutation({
    mutationFn: () => {
      const parsed = createUserSchema.safeParse({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: null,
        branchId: null,
        roles: [form.role],
      });

      if (!parsed.success) {
        const errors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join('.') || '_';
          errors[key] ??= t(issue.message);
        }
        setFieldErrors(errors);
        return Promise.reject(new Error('validation'));
      }

      setFieldErrors({});
      return api.createUser(parsed.data);
    },
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setFormError(null);
      setCreateOpen(false);
      invalidate();
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === 'validation') return;
      if (error instanceof ApiClientError) {
        const details = error.details as
          { fieldErrors?: Array<{ path: string; message: string }> } | undefined;
        if (details?.fieldErrors?.length) {
          setFieldErrors(
            Object.fromEntries(details.fieldErrors.map((f) => [f.path, t(f.message)])),
          );
          return;
        }
        setFormError(t(error.messageKey));
        return;
      }
      setFormError(t('errors.saveFailed'));
    },
  });

  const toggleStatus = useMutation({
    mutationFn: (user: UserView) =>
      api.updateUser(user.id, {
        status: user.status === UserStatus.ACTIVE ? UserStatus.DISABLED : UserStatus.ACTIVE,
      }),
    onSuccess: invalidate,
    onError: (error: unknown) =>
      setFormError(error instanceof ApiClientError ? t(error.messageKey) : t('errors.saveFailed')),
  });

  const changeRole = useMutation({
    mutationFn: ({ user, role }: { user: UserView; role: string }) =>
      api.updateUser(user.id, { roles: [role as SystemRole] }),
    onSuccess: invalidate,
    onError: (error: unknown) =>
      setFormError(error instanceof ApiClientError ? t(error.messageKey) : t('errors.saveFailed')),
  });

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader
        title={t('user.title')}
        subtitle={t('pageDescription.users')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <IconPlus width="18" height="18" />
            {t('user.newTitle')}
          </Button>
        }
      />

      {formError ? <ErrorState title={formError} /> : null}
      {create.isSuccess ? <SuccessBanner message={t('user.createSuccess')} /> : null}

      {createOpen ? (
        <>
          <button
            type="button"
            aria-label={t('common.close')}
            className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]"
            onClick={() => setCreateOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-user-title"
            className="fixed inset-y-0 end-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl"
          >
            <div className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 px-6">
              <div>
                <p className="text-xs font-semibold text-teal-700">{t('user.title')}</p>
                <h2 id="new-user-title" className="mt-1 text-xl font-bold text-slate-950">
                  {t('user.newTitle')}
                </h2>
              </div>
              <button
                type="button"
                aria-label={t('common.close')}
                className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setCreateOpen(false)}
              >
                <IconClose />
              </button>
            </div>

            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                setFormError(null);
                create.mutate();
              }}
            >
              <div className="flex-1 space-y-5 overflow-y-auto p-6">
                {formError ? <ErrorState title={formError} /> : null}
                <Field label={t('user.name')} htmlFor="name" required error={fieldErrors.name}>
                  <input
                    id="name"
                    className={inputClassName}
                    value={form.name}
                    onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                  />
                </Field>

                <Field
                  label={t('auth.username')}
                  htmlFor="email"
                  required
                  hint={t('auth.usernameHint')}
                  error={fieldErrors.email}
                >
                  <input
                    id="email"
                    dir="ltr"
                    autoComplete="off"
                    className={inputClassName}
                    value={form.email}
                    onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))}
                  />
                </Field>

                <Field
                  label={t('auth.password')}
                  htmlFor="password"
                  required
                  hint={t('auth.passwordHint')}
                  error={fieldErrors.password}
                >
                  <input
                    id="password"
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    className={inputClassName}
                    value={form.password}
                    onChange={(event) => setForm((f) => ({ ...f, password: event.target.value }))}
                  />
                </Field>

                <Field label={t('user.roles')} htmlFor="role" required error={fieldErrors.roles}>
                  <select
                    id="role"
                    className={inputClassName}
                    value={form.role}
                    onChange={(event) => setForm((f) => ({ ...f, role: event.target.value }))}
                  >
                    {Object.values(SystemRole).map((role) => (
                      <option key={role} value={role}>
                        {t(`role.${role}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/70 p-4">
                <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={create.isPending}>
                  {t('common.add')}
                </Button>
              </div>
            </form>
          </aside>
        </>
      ) : null}

      {users.isError ? (
        <ErrorState
          title={t('errors.loadFailed')}
          onRetry={() => void users.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}

      {/* Directly above the rows it narrows, rather than in the page heading
          where it read as a second global search. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-56 flex-1">
          <FilterSearch
            value={search}
            onChange={setSearch}
            placeholder={t('user.searchPlaceholder')}
          />
        </div>
      </div>

      <Panel title={t('user.title')} bodyClassName="">
        {users.isPending ? (
          <LoadingState label={t('common.loading')} />
        ) : (
          <DataTable
            rows={users.data?.data ?? []}
            rowKey={(user) => user.id}
            empty={<EmptyState title={t('user.empty')} />}
            columns={[
              {
                key: 'name',
                header: t('user.name'),
                cell: (user) => (
                  <span className="font-semibold text-slate-900">
                    {user.name}
                    {user.id === session?.id ? (
                      <span className="ms-2 text-xs font-normal text-slate-400">
                        ({t('common.yes')})
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'email',
                header: t('auth.username'),
                cell: (user) => <span dir="ltr">{user.email}</span>,
              },
              {
                key: 'role',
                header: t('user.roles'),
                cell: (user) => (
                  <select
                    aria-label={`${t('user.roles')} — ${user.name}`}
                    className={`${inputClassName} min-h-9 w-auto py-1`}
                    value={user.roles[0] ?? ''}
                    onChange={(event) => changeRole.mutate({ user, role: event.target.value })}
                  >
                    {Object.values(SystemRole).map((role) => (
                      <option key={role} value={role}>
                        {t(`role.${role}`)}
                      </option>
                    ))}
                  </select>
                ),
              },
              {
                key: 'lastLogin',
                header: t('user.lastLogin'),
                numeric: true,
                cell: (user) =>
                  user.lastLoginAt ? formatDateTime(locale, user.lastLoginAt) : t('cheque.notYet'),
              },
              {
                key: 'status',
                header: t('user.status'),
                cell: (user) =>
                  user.status === UserStatus.ACTIVE ? (
                    <Badge tone="success">{t('userStatus.ACTIVE')}</Badge>
                  ) : (
                    <Badge tone="danger">{t(`userStatus.${user.status}`)}</Badge>
                  ),
              },
              {
                key: 'actions',
                header: t('common.actions'),
                cell: (user) => (
                  <Button
                    variant="secondary"
                    // Disabling your own account needs a second administrator
                    // to undo, so the server refuses it and the button does too.
                    disabled={user.id === session?.id}
                    onClick={() => toggleStatus.mutate(user)}
                  >
                    {user.status === UserStatus.ACTIVE
                      ? t('userStatus.DISABLED')
                      : t('userStatus.ACTIVE')}
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Panel>
    </div>
  );
}
