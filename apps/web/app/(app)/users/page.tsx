'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { Permission, SystemRole, UserStatus, type UserView } from '@cheque-flow/shared-types';
import { createUserSchema } from '@cheque-flow/validation';
import {
  Badge,
  Button,
  ErrorState,
  Field,
  LoadingState,
  SuccessBanner,
  inputClassName,
} from '@cheque-flow/ui';

import { DataTable } from '@/components/data-table';
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
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <PageHeader
        title={t('user.title')}
        search={{ value: search, onChange: setSearch, placeholder: t('common.search') }}
      />

      {formError ? <ErrorState title={formError} /> : null}
      {create.isSuccess ? <SuccessBanner message={t('user.createSuccess')} /> : null}

      <Panel title={t('user.newTitle')}>
        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            setFormError(null);
            create.mutate();
          }}
        >
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

          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" loading={create.isPending}>
              {t('common.add')}
            </Button>
          </div>
        </form>
      </Panel>

      {users.isError ? (
        <ErrorState
          title={t('errors.loadFailed')}
          onRetry={() => void users.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}

      <Panel title={t('user.title')} bodyClassName="">
        {users.isPending ? (
          <LoadingState label={t('common.loading')} />
        ) : (
          <DataTable
            rows={users.data?.data ?? []}
            rowKey={(user) => user.id}
            empty={<p className="p-10 text-center text-sm text-slate-500">{t('user.empty')}</p>}
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
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
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
