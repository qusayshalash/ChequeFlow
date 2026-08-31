'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { Permission, type ContactStatementView } from '@cheque-flow/shared-types';
import { Badge, Button, ErrorState, LoadingState, SuccessBanner } from '@cheque-flow/ui';

import { ChequeTable } from '@/components/cheque-table';
import { FactGrid } from '@/components/fact-grid';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { usePermission } from '@/components/session';
import { money } from '@/lib/format';

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canManage = usePermission(Permission.CONTACT_MANAGE);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState('');

  const statement = useQuery<ContactStatementView>({
    queryKey: ['contact-statement', id],
    queryFn: () => api.getContactStatement(id),
  });

  const others = useQuery({
    queryKey: ['contacts', 'merge-targets'],
    enabled: canManage,
    queryFn: () => api.listContacts({ pageSize: 100, isActive: true }),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteContact(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      // The API deactivates instead of deleting when cheques reference the
      // contact; say which happened rather than claiming a deletion.
      if (result.deleted) router.replace('/contacts');
      else {
        setNotice(t('contact.deactivated'));
        void statement.refetch();
      }
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.saveFailed')),
  });

  const merge = useMutation({
    mutationFn: (targetId: string) => api.mergeContacts({ sourceId: id, targetId }),
    onSuccess: (target) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      router.replace(`/contacts/${target.id}`);
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.saveFailed')),
  });

  if (statement.isPending) return <LoadingState label={t('common.loading')} />;
  if (statement.isError || !statement.data) {
    return (
      <ErrorState
        title={t('errors.NOT_FOUND')}
        onRetry={() => void statement.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const { contact, currencies, creditLimit, cheques, totalCheques } = statement.data;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <PageHeader
        title={contact.name}
        subtitle={t(`contactType.${contact.type}`)}
        actions={
          canManage ? (
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => {
                setError(null);
                remove.mutate();
              }}
            >
              {t('common.delete')}
            </Button>
          ) : undefined
        }
      />

      {notice ? <SuccessBanner message={notice} /> : null}
      {error ? <ErrorState title={error} /> : null}
      {!contact.isActive ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {t('userStatus.DISABLED')}
        </p>
      ) : null}

      <Panel title={t('contact.title')}>
        <FactGrid
          facts={[
            { label: t('contact.phone'), value: contact.phone ?? '—', ltr: true },
            { label: t('contact.email'), value: contact.email ?? '—', ltr: true },
            { label: t('contact.companyName'), value: contact.companyName ?? '—' },
            { label: t('contact.nationalId'), value: contact.nationalId ?? '—', ltr: true },
            { label: t('contact.taxNumber'), value: contact.taxNumber ?? '—', ltr: true },
            { label: t('contact.address'), value: contact.address ?? '—' },
          ]}
        />
      </Panel>

      {/* Above the statement on purpose: whether this customer is already
          holding more than agreed is the question you ask before taking
          another cheque, not after reading the whole history. */}
      <Panel title={t('contact.creditLimit')}>
        {creditLimit === null ? (
          <p className="text-sm text-slate-500">{t('contact.creditNotSet')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">{t('contact.creditLimit')}</p>
                <p className="mt-1 text-sm font-bold text-slate-900 tabular-nums">
                  {money(locale, creditLimit.limit, creditLimit.currency)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">{t('contact.creditUsed')}</p>
                <p className="mt-1 text-sm font-bold text-amber-600 tabular-nums">
                  {money(locale, creditLimit.used, creditLimit.currency)}
                </p>
              </div>
              <div
                className={`rounded-xl border p-3 ${
                  creditLimit.exceeded ? 'border-red-200 bg-red-50' : 'border-slate-200'
                }`}
              >
                <p className="text-xs text-slate-500">
                  {creditLimit.exceeded ? t('contact.creditExceeded') : t('contact.creditHeadroom')}
                </p>
                <p
                  className={`mt-1 text-sm font-bold tabular-nums ${
                    creditLimit.exceeded ? 'text-red-700' : 'text-teal-700'
                  }`}
                >
                  {money(locale, creditLimit.headroom, creditLimit.currency)}
                </p>
              </div>
            </div>

            {/* Named rather than folded in: converting them at today's rate
                would make the headroom move on days when nothing happened. */}
            {creditLimit.otherCurrencies.length > 0 ? (
              <p className="text-xs text-slate-500">
                {t('contact.creditOther')}:{' '}
                {creditLimit.otherCurrencies
                  .map((entry) => money(locale, entry.total, entry.currency))
                  .join(' · ')}
              </p>
            ) : null}
          </div>
        )}
      </Panel>

      {/* The position, per currency. A single figure across currencies would
          be meaningless, so each gets its own row of four numbers. */}
      {currencies.length > 0 ? (
        <Panel title={t('contact.statement')}>
          <div className="flex flex-col gap-4">
            {currencies.map((entry) => (
              <div key={entry.currency}>
                <p className="mb-2 text-sm font-bold text-slate-900">{entry.currency}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    [
                      ['contact.pending', entry.pending, 'text-amber-600'],
                      ['contact.collected', entry.collected, 'text-teal-700'],
                      ['contact.bounced', entry.bounced, 'text-red-600'],
                      ['contact.returned', entry.returned, 'text-slate-600'],
                    ] as const
                  ).map(([labelKey, bucket, tone]) => (
                    <div key={labelKey} className="rounded-xl border border-slate-200 p-3">
                      <p className="text-xs text-slate-500">
                        {t(labelKey)} ({bucket.count})
                      </p>
                      <p className={`mt-1 text-sm font-bold tabular-nums ${tone}`}>
                        {money(locale, bucket.total, entry.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {canManage && (others.data?.data.length ?? 0) > 1 ? (
        <Panel title={t('contact.merge')}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-slate-600">{t('contact.mergeInto')}</span>
              <select
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={mergeTarget}
                onChange={(event) => setMergeTarget(event.target.value)}
              >
                <option value="">{t('common.unknown')}</option>
                {(others.data?.data ?? [])
                  .filter((entry) => entry.id !== id)
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              disabled={!mergeTarget}
              loading={merge.isPending}
              onClick={() => {
                setError(null);
                merge.mutate(mergeTarget);
              }}
            >
              {t('common.confirm')}
            </Button>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {t('contact.mergeConfirm', {
              source: contact.name,
              target:
                (others.data?.data ?? []).find((entry) => entry.id === mergeTarget)?.name ?? '…',
            })}
          </p>
        </Panel>
      ) : null}

      <Panel
        title={t('cheque.listTitle')}
        bodyClassName=""
        action={
          totalCheques > cheques.length ? (
            <Badge>{t('contact.statementLimited', { count: cheques.length })}</Badge>
          ) : undefined
        }
      >
        <ChequeTable cheques={cheques} />
      </Panel>
    </div>
  );
}
