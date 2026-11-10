'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { Permission, type BankSettingsView } from '@cheque-flow/shared-types';
import { createBankSchema, updateBankSchema } from '@cheque-flow/validation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  inputClassName,
} from '@cheque-flow/ui';

import { BankMark } from '@/components/bank-mark';
import { PageHeader } from '@/components/page-header';
import { useApi, useTranslator } from '@/components/providers';
import { RequirePermission } from '@/components/session';

/**
 * The message for a failed bank write. A name clash names the bank it clashes
 * with: «البنك الاسلامي الفلسطيني» is refused because of «البنك الإسلامي
 * الفلسطيني», and without seeing that the refusal looks like a mistake.
 */
function bankErrorMap(caught: ApiClientError): Record<string, string> {
  if (caught.details.reason === 'BANK_IN_USE') return { name: 'validation.bank.inUse' };
  const map = caught.fieldErrorMap;
  return Object.keys(map).length > 0 ? map : { name: caught.messageKey };
}

function errorText(t: (key: string) => string, key: string, caught: unknown): string {
  const existing =
    caught instanceof ApiClientError && typeof caught.details.existingName === 'string'
      ? caught.details.existingName
      : null;
  return existing && key === 'validation.bank.nameTaken' ? `${t(key)}: ${existing}` : t(key);
}

/**
 * The banks cheques are drawn on.
 *
 * Two kinds sit in one list. The reference banks ship with the server and are
 * shared by every organization on it, so they are shown but not editable: one
 * organization renaming one would rename it for the others. The rest are this
 * organization's own, added here; they can be renamed, or hidden from the
 * pickers without being deleted, because cheques already drawn on a bank must
 * keep pointing at it.
 */
export default function BanksPage() {
  return (
    <RequirePermission permission={Permission.BANK_MANAGE}>
      <BanksPageBody />
    </RequirePermission>
  );
}

function BanksPageBody() {
  const api = useApi();
  const t = useTranslator();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['banks', 'manage'],
    queryFn: () => api.listBanksForSettings(),
  });

  // Both lists: this page's, and the pickers' (`['banks']`), which a new or
  // hidden bank changes too.
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['banks'] });

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

  const own = query.data.filter((bank) => !bank.isReference);
  const reference = query.data.filter((bank) => bank.isReference);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader title={t('nav.banks')} subtitle={t('pageDescription.banks')} />

      <AddBankForm onAdded={refresh} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-soft">{t('bank.own')}</h2>
        {own.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {own.map((bank) => (
              <OwnBankCard key={bank.id} bank={bank} onChanged={refresh} />
            ))}
          </div>
        ) : (
          <EmptyState title={t('bank.empty')} />
        )}
        <p className="text-xs text-ink-muted">{t('bank.hiddenHint')}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-soft">{t('bank.reference')}</h2>
        <p className="text-xs text-ink-muted">{t('bank.referenceHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {reference.map((bank) => (
            <Card key={bank.id} className="p-0">
              <BankSummary bank={bank} />
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function BankSummary({ bank }: { bank: BankSettingsView }) {
  const t = useTranslator();
  return (
    <div className="flex items-start gap-3 p-4">
      <BankMark name={bank.name} logoUrl={bank.logoUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base font-bold text-ink">{bank.name}</p>
          {bank.isReference ? <Badge tone="info">{t('bank.reference')}</Badge> : null}
          {!bank.isActive ? <Badge tone="warning">{t('bank.hidden')}</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          <span dir="ltr" className="tabular-nums">
            {bank.code}
          </span>
          {' · '}
          <span className="tabular-nums">{bank.chequeCount}</span> {t('bank.cheques')}
        </p>
      </div>
    </div>
  );
}

function AddBankForm({ onAdded }: { onAdded: () => void }) {
  const api = useApi();
  const t = useTranslator();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lastError, setLastError] = useState<unknown>(null);

  const create = useMutation({
    mutationFn: () => {
      const parsed = createBankSchema.safeParse({ name, ...(code.trim() ? { code } : {}) });
      if (!parsed.success) {
        setFieldErrors(
          Object.fromEntries(
            parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
          ),
        );
        throw new Error('validation');
      }
      setFieldErrors({});
      return api.createBank(parsed.data);
    },
    onSuccess: () => {
      setName('');
      setCode('');
      onAdded();
    },
    onError: (caught: unknown) => {
      setLastError(caught);
      if (caught instanceof ApiClientError) {
        setFieldErrors(bankErrorMap(caught));
      } else if (!(caught instanceof Error && caught.message === 'validation')) {
        setFieldErrors({ name: 'errors.saveFailed' });
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Card className="p-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="md:flex-1">
          <Field
            label={t('bank.name')}
            htmlFor="bank-name"
            required
            error={fieldErrors.name ? errorText(t, fieldErrors.name, lastError) : undefined}
          >
            <input
              id="bank-name"
              className={inputClassName}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              autoComplete="off"
            />
          </Field>
        </div>
        <div className="md:w-56">
          <Field
            label={t('bank.code')}
            htmlFor="bank-code"
            hint={t('bank.codeHint')}
            error={fieldErrors.code ? t(fieldErrors.code) : undefined}
          >
            <input
              id="bank-code"
              className={inputClassName}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={12}
              dir="ltr"
              autoComplete="off"
            />
          </Field>
        </div>
        {/* Lined up with the inputs, not with their labels. */}
        <Button type="submit" loading={create.isPending} className="md:mt-7">
          {t('bank.add')}
        </Button>
      </form>
    </Card>
  );
}

function OwnBankCard({ bank, onChanged }: { bank: BankSettingsView; onChanged: () => void }) {
  const api = useApi();
  const t = useTranslator();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(bank.name);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<unknown>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleError = (caught: unknown) => {
    setLastError(caught);
    if (caught instanceof ApiClientError) {
      setError(bankErrorMap(caught).name ?? caught.messageKey);
    } else if (!(caught instanceof Error && caught.message === 'validation')) {
      setError('errors.saveFailed');
    }
  };

  const remove = useMutation({
    mutationFn: () => api.deleteBank(bank.id),
    onSuccess: () => {
      setConfirmDelete(false);
      onChanged();
    },
    onError: (caught: unknown) => {
      setConfirmDelete(false);
      handleError(caught);
    },
  });

  const update = useMutation({
    mutationFn: (input: { name?: string; isActive?: boolean }) => {
      const parsed = updateBankSchema.safeParse(input);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'errors.VALIDATION_ERROR');
        throw new Error('validation');
      }
      return api.updateBank(bank.id, parsed.data);
    },
    onSuccess: () => {
      setError(null);
      setEditing(false);
      onChanged();
    },
    onError: handleError,
  });

  const message = error ? errorText(t, error, lastError) : undefined;

  return (
    <Card className={`p-0 ${bank.isActive ? '' : 'opacity-75'}`}>
      {editing ? (
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({ name });
          }}
        >
          <Field label={t('bank.name')} htmlFor={`bank-${bank.id}`} error={message}>
            <input
              id={`bank-${bank.id}`}
              className={inputClassName}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              autoFocus
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={update.isPending}>
              {t('bank.save')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setName(bank.name);
                setError(null);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <BankSummary bank={bank} />
          {message ? <p className="px-4 pb-2 text-xs text-danger">{message}</p> : null}
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-line/70 bg-danger-soft/40 px-4 py-2.5">
              <p className="me-auto text-xs font-semibold text-danger">{t('bank.deleteConfirm')}</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setConfirmDelete(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                loading={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {t('bank.delete')}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 border-t border-line/70 px-4 py-2.5">
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
                {t('bank.rename')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                loading={update.isPending}
                onClick={() => update.mutate({ isActive: !bank.isActive })}
              >
                {bank.isActive ? t('bank.hide') : t('bank.show')}
              </Button>
              {/* Only a bank no cheque uses can go; the rest can only be hidden. */}
              {bank.chequeCount === 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ms-auto text-danger"
                  onClick={() => {
                    setError(null);
                    setConfirmDelete(true);
                  }}
                >
                  {t('bank.delete')}
                </Button>
              ) : null}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
