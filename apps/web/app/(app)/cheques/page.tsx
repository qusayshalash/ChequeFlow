'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { ChequeStatus, type ChequeSummaryView, type Paginated } from '@cheque-flow/shared-types';
import { Button, ErrorState, LoadingState } from '@cheque-flow/ui';

import { ChequeTable } from '@/components/cheque-table';
import { IconPlus } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';

/** The tabs across the top, each a saved filter rather than a separate page. */
const TABS = [
  { key: 'ALL', labelKey: 'cheque.tabAll' },
  { key: 'INCOMING', labelKey: 'cheque.tabIncoming' },
  { key: 'OUTGOING', labelKey: 'cheque.tabOutgoing' },
  { key: 'OVERDUE', labelKey: 'cheque.tabOverdue' },
  { key: 'BOUNCED', labelKey: 'cheque.tabBounced' },
] as const;

type Tab = (typeof TABS)[number]['key'];

export default function ChequesPage() {
  const api = useApi();
  const t = useTranslator();

  const [tab, setTab] = useState<Tab>('ALL');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);

  /** Translates a tab into the query the API understands. */
  const tabQuery =
    tab === 'INCOMING'
      ? { direction: 'INCOMING' as const }
      : tab === 'OUTGOING'
        ? { direction: 'OUTGOING' as const }
        : tab === 'OVERDUE'
          ? { overdue: true }
          : tab === 'BOUNCED'
            ? { status: [ChequeStatus.BOUNCED] }
            : {};

  const query = useQuery<Paginated<ChequeSummaryView>>({
    queryKey: ['cheques', { tab, search, status, page }],
    queryFn: () =>
      api.listCheques({
        page,
        pageSize: 20,
        ...tabQuery,
        ...(search ? { search } : {}),
        ...(status ? { status: [status as ChequeStatus] } : {}),
      }),
    // Keeps the previous page on screen while the next one loads, instead of
    // collapsing the table to a spinner on every keystroke.
    placeholderData: keepPreviousData,
  });

  function changeTab(next: Tab): void {
    setTab(next);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title={t('cheque.listTitle')}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value);
            setPage(1);
          },
          placeholder: t('dashboard.searchPlaceholder'),
        }}
        actions={
          <Link
            href="/cheques/new"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
          >
            <IconPlus />
            {t('cheque.newTitle')}
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div
          className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1"
          role="group"
          aria-label={t('cheque.filterTitle')}
        >
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => changeTab(entry.key)}
              aria-pressed={tab === entry.key}
              className={`h-9 rounded-lg px-4 text-sm font-semibold transition-colors ${
                tab === entry.key ? 'bg-teal-800 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t(entry.labelKey)}
            </button>
          ))}
        </div>

        <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
          <span className="text-sm text-slate-500">{t('cheque.status')}</span>
          <select
            className="bg-transparent text-sm font-medium text-slate-700 outline-none"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('common.all')}</option>
            {Object.values(ChequeStatus).map((value) => (
              <option key={value} value={value}>
                {t(`status.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {query.isError ? (
        <ErrorState
          title={t('errors.loadFailed')}
          onRetry={() => void query.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}

      <Panel bodyClassName="">
        {query.isPending ? (
          <LoadingState label={t('common.loading')} />
        ) : (
          <ChequeTable cheques={query.data?.data ?? []} />
        )}
      </Panel>

      {query.data && query.data.meta.totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t('common.page')}>
          <Button
            variant="secondary"
            disabled={query.data.meta.page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {t('common.previous')}
          </Button>
          <span className="text-sm text-slate-500 tabular-nums">
            {t('common.page')} {query.data.meta.page} {t('common.of')} {query.data.meta.totalPages}
            {' · '}
            {t('common.total')}: {query.data.meta.total}
          </span>
          <Button
            variant="secondary"
            disabled={!query.data.meta.hasNextPage}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('common.next')}
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
