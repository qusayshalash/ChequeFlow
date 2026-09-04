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
import { FilterSearch } from '@/components/filter-search';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Tabs } from '@/components/tabs';
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

type Tab = (typeof TABS)[number]['key'];
type ChequeSortKey = 'dueDate' | 'amount' | 'createdAt' | 'chequeNumber' | 'status';

export default function ChequesPage() {
  const api = useApi();
  const t = useTranslator();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>('ALL');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [status, setStatus] = useState<string>('');
  const [bankId, setBankId] = useState<string>('');
  const [pageSize, setPageSize] = useState(20);
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
      {
        tab,
        search,
        status,
        bankId,
        applied,
        amountMin,
        amountMax,
        sortBy,
        sortOrder,
        page,
        pageSize,
      },
    ],
    queryFn: () =>
      api.listCheques({
        page,
        pageSize,
        ...tabQuery,
        ...(search ? { search } : {}),
        ...(status ? { status: [status as ChequeStatus] } : {}),
        ...(applied.from ? { dueFrom: applied.from } : {}),
        ...(applied.to ? { dueTo: applied.to } : {}),
        ...(bankId ? { bankId } : {}),
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
  const banks = useQuery({ queryKey: ['banks'], queryFn: () => api.listBanks() });

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

  /** How many filters are narrowing the list right now. */
  const activeFilters =
    (tab === 'ALL' ? 0 : 1) +
    (status ? 1 : 0) +
    (bankId ? 1 : 0) +
    (applied.from || applied.to ? 1 : 0) +
    (amountMin || amountMax ? 1 : 0) +
    (search ? 1 : 0);

  function clearFilters(): void {
    setTab('ALL');
    setStatus('');
    setBankId('');
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
        // No "new cheque" button here: the top bar carries one on every page,
        // and it offers the batch form this one could not.
        actions={
          <ExportButton
            query={{
              ...tabQuery,
              ...(search ? { search } : {}),
              ...(status ? { status: [status as ChequeStatus] } : {}),
              ...(bankId ? { bankId } : {}),
              ...(applied.from ? { dueFrom: applied.from } : {}),
              ...(applied.to ? { dueTo: applied.to } : {}),
              ...(amountMin ? { amountMin } : {}),
              ...(amountMax ? { amountMax } : {}),
              sortBy,
              sortOrder,
            }}
          />
        }
      />

      {/* A toolbar, not a panel. This was a bordered card holding thirteen
          controls — seven tabs and six inputs — which is what made it read as
          clutter however the rows were arranged. The box is gone, the tabs are
          plain text with an underline, and the three refiners moved inside the
          filter popover, so the resting state is a row of tabs and two
          buttons. */}
      <section className="mb-4" aria-label={t('cheque.filterTitle')}>
        <div className="flex flex-col gap-3">
          {/* The shared strip, so this list and the contacts list cannot
              drift apart again. */}
          <Tabs
            tabs={TABS.map((entry) => ({
              key: entry.key,
              label: t(entry.labelKey),
              // The count turns a filter from a guess into a decision: nobody
              // opens "bounced" to find out whether there are any.
              ...(tabCounts[entry.key] === undefined ? {} : { count: tabCounts[entry.key] }),
              tone: entry.tone,
            }))}
            active={tab}
            onChange={(key) => changeTab(key as Tab)}
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-56 flex-1">
              <FilterSearch
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                placeholder={t('cheque.filterPlaceholder')}
              />
            </div>

            {/* Which bank the cheque is drawn on. Missing until now, and the
                filter people reach for most after status: a deposit run is
                organised one bank at a time. */}

            {/* Only once something is actually filtered: a permanently visible
                "clear" is a button that does nothing most of the time. */}
            {activeFilters > 0 ? (
              <Button variant="ghost" onClick={clearFilters}>
                {t('common.clearFilters')} ({activeFilters})
              </Button>
            ) : null}

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
              {/* `start-0`, not `end-0`. In a right-to-left page the inline end is
                  the left, so anchoring there made the panel grow rightwards out
                  of the window — 95px past the edge on a phone, which is where
                  the page's sideways scroll came from. Anchored at the inline
                  start it opens inwards, away from the edge. */}
              <div className="absolute start-0 z-20 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
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

        {/* Everything that narrows the list, in one place, opened on demand.
            Status, bank and date used to sit permanently in the toolbar; they
            are used far less often than search and were most of its bulk. */}
        {filtersOpen ? (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/90 bg-white p-3">
            <label className="inline-flex h-11 w-36 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 hover:border-slate-300 xl:w-44">
              <span className="text-xs font-medium text-slate-400">{t('cheque.status')}</span>
              <select
                className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold text-slate-700 outline-none"
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

            <label className="inline-flex h-11 w-36 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 hover:border-slate-300 xl:w-44">
              <span className="text-xs font-medium text-slate-400">{t('cheque.bank')}</span>
              <select
                className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold text-slate-700 outline-none"
                value={bankId}
                onChange={(event) => {
                  setBankId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t('common.all')}</option>
                {(banks.data ?? []).map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
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

      {/* The shared control, so this list numbers its pages and offers a
          page size like every other one — it used to carry a bespoke
          prev/next pair that could only step one page at a time. */}
      {query.data ? (
        <Pagination
          meta={query.data.meta}
          onPageChange={(next) => {
            setPage(next);
            // Selection is per page; carrying it across would apply a bulk
            // action to rows that are no longer on screen.
            setSelected(new Set());
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setSelected(new Set());
          }}
        />
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
