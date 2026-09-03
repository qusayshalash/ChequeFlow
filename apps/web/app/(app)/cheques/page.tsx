'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { ChequeStatus, type ChequeSummaryView, type Paginated } from '@cheque-flow/shared-types';
import { Button, ErrorState, LoadingState } from '@cheque-flow/ui';

import { BulkActionBar } from '@/components/bulk-action-bar';
import { CHEQUE_COLUMN_KEYS, ChequeTable } from '@/components/cheque-table';
import { ExportButton } from '@/components/export-button';
import {
  DateRangePicker,
  EMPTY_RANGE,
  isRangeInvalid,
  type DateRange,
} from '@/components/date-range';
import { IconColumns, IconFilter, IconPlus } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';

/** The tabs across the top, each a saved filter rather than a separate page. */
const TABS = [
  { key: 'ALL', labelKey: 'cheque.tabAll', tone: 'slate' },
  { key: 'REVIEW', labelKey: 'nav.review', tone: 'violet' },
  { key: 'DUE', labelKey: 'cheque.tabDue', tone: 'amber' },
  { key: 'BOUNCED', labelKey: 'cheque.tabBounced', tone: 'red' },
  { key: 'CLEARED', labelKey: 'status.CLEARED', tone: 'emerald' },
  { key: 'INCOMING', labelKey: 'cheque.tabIncoming', tone: 'slate' },
  { key: 'OUTGOING', labelKey: 'cheque.tabOutgoing', tone: 'slate' },
] as const;

/** The count badge's colour per tab, so a filter reads as its own status. */
const TAB_BADGE: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-600',
  violet: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  emerald: 'bg-emerald-100 text-emerald-700',
};

type Tab = (typeof TABS)[number]['key'];
type ChequeSortKey = 'dueDate' | 'amount' | 'createdAt' | 'chequeNumber' | 'status';

export default function ChequesPage() {
  const api = useApi();
  const t = useTranslator();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>('ALL');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [status, setStatus] = useState<string>('');
  const [range, setRange] = useState<DateRange>(EMPTY_RANGE);
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<ChequeSortKey>('dueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [visibleColumns, setVisibleColumns] = useState<ReadonlySet<string>>(
    () => new Set(CHEQUE_COLUMN_KEYS),
  );
  const [page, setPage] = useState(1);

  // Selection is deliberately cleared whenever the visible set changes. A
  // ticked cheque that has scrolled out of the filter is a cheque the user can
  // no longer see themselves acting on.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // A backwards range would return an empty table that looks like "no cheques",
  // so it is not sent until the dates make sense.
  const applied = isRangeInvalid(range) ? EMPTY_RANGE : range;

  /** Translates a tab into the query the API understands. */
  const tabQuery =
    tab === 'INCOMING'
      ? { direction: 'INCOMING' as const }
      : tab === 'OUTGOING'
        ? { direction: 'OUTGOING' as const }
        : tab === 'REVIEW'
          ? { status: [ChequeStatus.DRAFT, ChequeStatus.PENDING_REVIEW] }
          : tab === 'DUE'
            ? { overdue: true }
            : tab === 'BOUNCED'
              ? { status: [ChequeStatus.BOUNCED] }
              : tab === 'CLEARED'
                ? { status: [ChequeStatus.CLEARED] }
                : {};

  const query = useQuery<Paginated<ChequeSummaryView>>({
    queryKey: [
      'cheques',
      { tab, search, status, applied, amountMin, amountMax, sortBy, sortOrder, page },
    ],
    queryFn: () =>
      api.listCheques({
        page,
        pageSize: 20,
        ...tabQuery,
        ...(search ? { search } : {}),
        ...(status ? { status: [status as ChequeStatus] } : {}),
        ...(applied.from ? { dueFrom: applied.from } : {}),
        ...(applied.to ? { dueTo: applied.to } : {}),
        ...(amountMin ? { amountMin } : {}),
        ...(amountMax ? { amountMax } : {}),
        sortBy,
        sortOrder,
      }),
    // Keeps the previous page on screen while the next one loads, instead of
    // collapsing the table to a spinner on every keystroke.
    placeholderData: keepPreviousData,
  });

  /**
   * The number beside each filter.
   *
   * Read from the dashboard summary, which already computes every bucket in
   * one query — counting them again per tab would be five more round trips for
   * numbers the server has already added up. Summed across currencies because
   * a count of cheques is not money and can be added safely.
   */
  const summary = useQuery({ queryKey: ['dashboard'], queryFn: () => api.getDashboard() });

  const tabCounts: Record<string, number | undefined> = (() => {
    const data = summary.data;
    if (!data) return { ALL: query.data?.meta.total };

    const currencies = data.currencies;
    const sum = (pick: (block: (typeof currencies)[number]) => { count: number }): number =>
      currencies.reduce((total, block) => total + pick(block).count, 0);

    return {
      ALL: query.data?.meta.total,
      REVIEW: sum((block) => block.draft),
      DUE: sum((block) => block.overdue) + sum((block) => block.dueWithin30Days),
      BOUNCED: sum((block) => block.bounced),
      CLEARED: sum((block) => block.cleared),
    };
  })();

  function changeTab(next: Tab): void {
    setTab(next);
    setPage(1);
    setSelected(new Set());
  }

  function toggle(id: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function toggleAll(keys: string[]): void {
    setSelected((current) => {
      const allOn = keys.length > 0 && keys.every((key) => current.has(key));
      const next = new Set(current);
      for (const key of keys) {
        if (allOn) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  function toggleColumn(key: string): void {
    setVisibleColumns((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function clearFilters(): void {
    setTab('ALL');
    setStatus('');
    setRange(EMPTY_RANGE);
    setAmountMin('');
    setAmountMax('');
    setPage(1);
    setSelected(new Set());
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title={t('cheque.listTitle')}
        subtitle={t('pageDescription.cheques')}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value);
            setPage(1);
          },
          placeholder: t('dashboard.searchPlaceholder'),
        }}
        actions={
          <>
            <ExportButton
              query={{
                ...tabQuery,
                ...(search ? { search } : {}),
                ...(status ? { status: [status as ChequeStatus] } : {}),
                ...(applied.from ? { dueFrom: applied.from } : {}),
                ...(applied.to ? { dueTo: applied.to } : {}),
                ...(amountMin ? { amountMin } : {}),
                ...(amountMax ? { amountMax } : {}),
                sortBy,
                sortOrder,
              }}
            />
            <Link
              href="/cheques/new"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
            >
              <IconPlus />
              {t('cheque.newTitle')}
            </Link>
          </>
        }
      />

      <section
        className="mb-5 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-[0_1px_2px_rgb(16_24_40/0.035)]"
        aria-label={t('cheque.filterTitle')}
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div
            className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1"
            role="group"
            aria-label={t('cheque.filterTitle')}
          >
            {TABS.map((entry) => {
              const count = tabCounts[entry.key];
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => changeTab(entry.key)}
                  aria-pressed={tab === entry.key}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold ${
                    tab === entry.key
                      ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {t(entry.labelKey)}
                  {/* The count turns a filter from a guess into a decision:
                      nobody opens "bounced" to find out whether there are any. */}
                  {count === undefined ? null : (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${TAB_BADGE[entry.tone] ?? TAB_BADGE.slate}`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-11 min-w-40 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 hover:border-slate-300">
              <span className="text-xs font-medium text-slate-400">{t('cheque.status')}</span>
              <select
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none"
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

            <DateRangePicker
              value={range}
              onChange={(next) => {
                setRange(next);
                setPage(1);
              }}
            />

            <Button
              variant={filtersOpen ? 'outline' : 'secondary'}
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
            >
              <IconFilter width="18" height="18" />
              {t('common.filters')}
            </Button>

            <details className="group relative">
              <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50">
                <IconColumns width="18" height="18" />
                {t('common.columns')}
              </summary>
              <div className="absolute end-0 z-20 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                {CHEQUE_COLUMN_KEYS.map((key) => {
                  const labelKey =
                    key === 'number'
                      ? 'cheque.number'
                      : key === 'party'
                        ? 'cheque.party'
                        : key === 'bank'
                          ? 'cheque.bank'
                          : key === 'due'
                            ? 'cheque.dueDate'
                            : key === 'amount'
                              ? 'common.amount'
                              : key === 'location'
                                ? 'cheque.currentLocation'
                                : 'cheque.status';
                  return (
                    <label
                      key={key}
                      className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.has(key)}
                        onChange={() => toggleColumn(key)}
                        className="size-4 accent-teal-700"
                      />
                      {t(labelKey)}
                    </label>
                  );
                })}
              </div>
            </details>
          </div>
        </div>

        {filtersOpen ? (
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <label className="flex min-w-44 flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500">
                {t('common.amount')} — {t('cheque.from')}
              </span>
              <input
                dir="ltr"
                inputMode="decimal"
                placeholder="0.00"
                value={amountMin}
                onChange={(event) => {
                  setAmountMin(event.target.value);
                  setPage(1);
                }}
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              />
            </label>
            <label className="flex min-w-44 flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500">
                {t('common.amount')} — {t('cheque.to')}
              </span>
              <input
                dir="ltr"
                inputMode="decimal"
                placeholder="0.00"
                value={amountMax}
                onChange={(event) => {
                  setAmountMax(event.target.value);
                  setPage(1);
                }}
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              />
            </label>
            <Button variant="ghost" onClick={clearFilters}>
              {t('common.clearFilters')}
            </Button>
          </div>
        ) : null}
      </section>

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
          <ChequeTable
            cheques={query.data?.data ?? []}
            // A blank panel is a dead end. When a filter has emptied the list,
            // the useful next move is still recording a cheque.
            emptyAction={
              <Link
                href="/cheques/new"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
              >
                <IconPlus />
                {t('cheque.newTitle')}
              </Link>
            }
            selection={{
              selected,
              onToggle: toggle,
              onToggleAll: toggleAll,
              selectAllLabel: t('bulk.selectAll'),
            }}
            visibleColumns={visibleColumns}
            sort={{
              key: sortBy,
              direction: sortOrder,
              onChange: (key, direction) => {
                setSortBy(key as ChequeSortKey);
                setSortOrder(direction);
                setPage(1);
                setSelected(new Set());
              },
            }}
          />
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

      {/* Docked to the bottom of the window, so it is reachable from anywhere
          in a long table. Padding below keeps it from covering the last row. */}
      <div
        aria-hidden
        // Real space at the end of the page, matching the bar, so the last row
        // can always be scrolled clear of it instead of ending underneath.
        style={{ height: 'var(--bulk-bar-height, 0px)' }}
      />
      <BulkActionBar selected={selected} onClear={() => setSelected(new Set())} />
    </div>
  );
}
