'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ChequeStatus, utcToday, type DashboardSummary } from '@cheque-flow/shared-types';
import { EmptyState, ErrorState, LoadingState } from '@cheque-flow/ui';

import { AttentionList } from '@/components/attention-list';
import { BankMark } from '@/components/bank-mark';
import {
  IconAlert,
  IconCalendar,
  IconCheque,
  IconChevronEnd,
  IconClock,
  IconDots,
  IconReturn,
} from '@/components/icons';
import { LineChart } from '@/components/line-chart';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { formatDate, formatDayMonth, money } from '@/lib/format';

/** Windows the chart offers, in days back from today. */
const WINDOWS = [
  { days: 30, labelKey: 'dashboard.last30Days' },
  { days: 7, labelKey: 'dashboard.last7Days' },
  { days: 90, labelKey: 'dashboard.last90Days' },
] as const;

/** `YYYY-MM-DD` shifted by whole days. */
function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Every day from `from` to `to` inclusive. */
function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) out.push(day);
  return out;
}

export default function DashboardPage() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();

  const today = utcToday();
  const [currency, setCurrency] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number>(30);

  // Centred on today: half the window behind, half ahead. The chart's job is
  // to put what has happened next to what is coming, and a window that ends
  // today would show only the first of those.
  const chartFrom = addDays(today, -Math.round(windowDays * 0.7));
  const chartTo = addDays(today, Math.round(windowDays * 0.3));

  const dashboard = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  });

  const cashFlow = useQuery({
    queryKey: ['dashboard-cash-flow', chartFrom, chartTo],
    queryFn: () => api.getCashFlowReport({ from: chartFrom, to: chartTo, granularity: 'day' }),
  });

  // Deliberately not tied to the chart's window. "What is coming" is a
  // separate question from "what does the last month look like", and pinning
  // it to a seven-day chart emptied the table on a book whose next cheque is
  // three weeks out.
  const due = useQuery({
    queryKey: ['dashboard-due'],
    queryFn: () => api.getDueReport({ from: today, to: addDays(today, 90), includeOverdue: false }),
  });

  // The red series. Bounced cheques are real records with real dates, so the
  // line is read off them rather than modelled — there is no cash-flow series
  // for refusals, and inventing one on a finance dashboard is not an option.
  const bounced = useQuery({
    queryKey: ['dashboard-bounced', chartFrom, chartTo],
    queryFn: () =>
      api.listCheques({
        status: [ChequeStatus.BOUNCED],
        dueFrom: chartFrom,
        dueTo: chartTo,
        pageSize: 100,
      }),
  });

  const currencies = useMemo(
    () => dashboard.data?.currencies.map((entry) => entry.currency) ?? [],
    [dashboard.data],
  );

  /**
   * The figures behind the cards and the attention panel.
   *
   * With a currency selected this is that currency's block. With "all"
   * selected the counts are added — a cheque is a cheque — while the money is
   * listed per currency rather than summed into a figure that means nothing.
   */
  const totals = useMemo(() => {
    const blocks = dashboard.data?.currencies ?? [];
    const chosen = currency ? blocks.filter((entry) => entry.currency === currency) : blocks;

    const bucket = (key: 'draft' | 'dueWithin7Days' | 'overdue' | 'bounced' | 'cleared') => ({
      count: chosen.reduce((sum, entry) => sum + entry[key].count, 0),
      money: chosen
        .filter((entry) => entry[key].count > 0)
        .map((entry) => money(locale, entry[key].total, entry.currency))
        .join(' · '),
    });

    return {
      draft: bucket('draft'),
      dueSoon: bucket('dueWithin7Days'),
      overdue: bucket('overdue'),
      bounced: bucket('bounced'),
      cleared: bucket('cleared'),
    };
  }, [dashboard.data, currency, locale]);

  /**
   * The chart, one point per day across the window.
   *
   * Days are generated from the calendar rather than taken from the response:
   * the report only returns days that contain cheques, so a quiet fortnight
   * would collapse into a few stray points instead of showing the flat stretch
   * that is the actual news.
   *
   * Everything from tomorrow on is drawn dashed. Those cheques are due, not
   * banked, and one stroke for both would state more than the data supports.
   */
  const chart = useMemo(() => {
    const pick = currency ?? currencies[0];
    if (!pick) return null;

    const inflowByDay = new Map(
      (cashFlow.data?.periods ?? []).map((period) => [
        period.period,
        period.byCurrency.find((row) => row.currency === pick),
      ]),
    );

    const bouncedByDay = new Map<string, number>();
    for (const cheque of bounced.data?.data ?? []) {
      if (cheque.currency !== pick) continue;
      bouncedByDay.set(
        cheque.dueDate,
        (bouncedByDay.get(cheque.dueDate) ?? 0) + Number(cheque.amount),
      );
    }

    const days = daysBetween(chartFrom, chartTo);
    const futureFrom = days.findIndex((day) => day > today);

    return {
      currency: pick,
      days,
      labels: days.map((day) => formatDayMonth(locale, day)),
      series: [
        {
          label: t('dashboard.expectedFlow'),
          values: days.map((day) => Number(inflowByDay.get(day)?.inflow ?? 0)),
          color: '#0B7C6B',
          fill: 'url(#flowFill)',
          ...(futureFrom >= 0 ? { dashedFrom: futureFrom } : {}),
        },
        {
          label: t('dashboard.collectedSeries'),
          values: days.map((day) => Number(inflowByDay.get(day)?.outflow ?? 0)),
          color: '#12866F',
        },
        {
          label: t('dashboard.bouncedSeries'),
          values: days.map((day) => bouncedByDay.get(day) ?? 0),
          color: '#E5484D',
        },
      ],
      netTotal: (cashFlow.data?.periods ?? []).reduce(
        (sum, period) =>
          sum + Number(period.byCurrency.find((row) => row.currency === pick)?.net ?? 0),
        0,
      ),
    };
  }, [cashFlow.data, bounced.data, currency, currencies, chartFrom, chartTo, today, locale, t]);

  const upcomingAll = (due.data?.cheques ?? []).filter((cheque) =>
    currency ? cheque.currency === currency : true,
  );
  const upcoming = upcomingAll.slice(0, 5);

  if (dashboard.isPending) return <LoadingState label={t('common.loading')} />;
  if (dashboard.isError || !dashboard.data) {
    return (
      <ErrorState
        title={t('errors.loadFailed')}
        onRetry={() => void dashboard.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const base = dashboard.data.baseTotal;

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={
          currencies.length > 1 ? (
            <div
              className="inline-flex rounded-xl border border-slate-200 bg-white p-1"
              role="group"
              aria-label={t('cheque.currency')}
            >
              <CurrencyChip
                label={t('cheque.tabAll')}
                active={currency === null}
                onClick={() => setCurrency(null)}
              />
              {currencies.map((code) => (
                <CurrencyChip
                  key={code}
                  label={code}
                  active={currency === code}
                  onClick={() => setCurrency(code)}
                />
              ))}
            </div>
          ) : undefined
        }
      />

      {/* Four headline figures, largest scope first: everything, then what is
          coming, then what is late, then what is not yet confirmed. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('dashboard.totalCheques')}
          value={String(base.count)}
          amountLabel={t('dashboard.totalAmount')}
          amount={money(locale, base.total, base.currency)}
          tone="teal"
          Icon={IconCheque}
          href="/cheques"
        />
        <StatCard
          label={t('dashboard.dueWithin7Days')}
          value={String(totals.dueSoon.count)}
          amountLabel={t('dashboard.totalAmount')}
          amount={totals.dueSoon.money}
          tone="green"
          Icon={IconCalendar}
          href="/cheques/due"
        />
        <StatCard
          label={t('dashboard.overdue')}
          value={String(totals.overdue.count)}
          amountLabel={t('dashboard.totalAmount')}
          amount={totals.overdue.money}
          tone="red"
          Icon={IconAlert}
          href="/cheques/due"
        />
        <StatCard
          label={t('dashboard.pendingConfirm')}
          value={String(totals.draft.count)}
          amountLabel={t('dashboard.totalAmount')}
          amount={totals.draft.money}
          tone="amber"
          Icon={IconClock}
          href="/cheques/review"
        />
      </div>

      {/* Only the base-currency figure carries an unconverted warning, and it
          belongs beside the figure rather than in a banner of its own. */}
      {base.unconvertedCount > 0 ? (
        <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-700">
          {t('dashboard.unconverted', { count: String(base.unconvertedCount) })}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(320px,1fr)_minmax(0,1.75fr)] xl:items-stretch">
        <AttentionList
          items={[
            {
              key: 'overdue',
              label: t('dashboard.overdueCheques'),
              count: totals.overdue.count,
              amount: totals.overdue.money,
              tone: 'red',
              Icon: IconAlert,
              href: '/cheques/due',
            },
            {
              key: 'due-soon',
              label: t('dashboard.chequesWithin7'),
              count: totals.dueSoon.count,
              amount: totals.dueSoon.money,
              tone: 'amber',
              Icon: IconCalendar,
              href: '/cheques/due',
            },
            {
              key: 'bounced',
              label: t('dashboard.bouncedCheques'),
              count: totals.bounced.count,
              amount: totals.bounced.money,
              tone: 'teal',
              Icon: IconReturn,
              href: '/cheques/bounced',
            },
            {
              key: 'pending',
              label: t('dashboard.pendingConfirm'),
              count: totals.draft.count,
              amount: totals.draft.money,
              tone: 'slate',
              Icon: IconClock,
              href: '/cheques/review',
            },
          ]}
        />

        <section className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[13px] font-semibold text-slate-600 hover:border-slate-300">
              <IconCalendar width="15" height="15" className="text-slate-400" />
              <select
                className="bg-transparent pe-1 outline-none"
                value={windowDays}
                onChange={(event) => setWindowDays(Number(event.target.value))}
                aria-label={t('common.period')}
              >
                {WINDOWS.map((entry) => (
                  <option key={entry.days} value={entry.days}>
                    {t(entry.labelKey)}
                  </option>
                ))}
              </select>
            </label>

            {chart ? (
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
                {chart.series.map((entry) => (
                  <Legend key={entry.label} color={entry.color} label={entry.label} />
                ))}
              </div>
            ) : null}
          </div>

          {cashFlow.isPending ? <LoadingState label={t('common.loading')} /> : null}

          {chart ? (
            <>
              <svg width="0" height="0" aria-hidden="true" className="absolute">
                <defs>
                  <linearGradient id="flowFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0B7C6B" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#0B7C6B" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>

              <LineChart
                series={chart.series}
                labels={chart.labels}
                axisLabel={`${t('dashboard.amountAxisShort')} (${chart.currency})`}
                height={230}
                showPoints={false}
                // Six dates across the axis, whatever the window length.
                labelEvery={Math.max(1, Math.round(chart.labels.length / 6))}
              />

              {/* The chart is hidden from screen readers; this is the same
                  information as text. */}
              <p className="sr-only">
                {chart.series
                  .map(
                    (entry) =>
                      `${entry.label}: ${entry.values
                        .map((value, index) => `${chart.labels[index]} ${value}`)
                        .join('، ')}`,
                  )
                  .join(' — ')}
              </p>

              <div className="mt-4 grid grid-cols-1 divide-slate-200/70 rounded-xl bg-slate-50/70 p-3 text-center sm:grid-cols-3 sm:divide-x sm:divide-x-reverse">
                <Summary
                  label={t('dashboard.totalCollected')}
                  value={totals.cleared.money || money(locale, '0', chart.currency)}
                  tone="text-teal-700"
                />
                <Summary
                  label={t('dashboard.totalBounced')}
                  value={totals.bounced.money || money(locale, '0', chart.currency)}
                  tone="text-red-500"
                />
                <Summary
                  label={t('dashboard.netExpected')}
                  value={money(locale, chart.netTotal.toFixed(2), chart.currency)}
                  tone="text-teal-700"
                />
              </div>
            </>
          ) : cashFlow.isPending ? null : (
            <EmptyState title={t('reports.empty')} />
          )}
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <Link
            href="/cheques"
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-3 text-[13px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {t('dashboard.viewAllCheques')}
            <IconChevronEnd width="15" height="15" />
          </Link>
          <h2 className="text-[15px] font-bold text-slate-900">{t('dashboard.upcomingTitle')}</h2>
        </div>

        {due.isPending ? <LoadingState label={t('common.loading')} /> : null}

        {!due.isPending && upcoming.length === 0 ? (
          <EmptyState title={t('cheque.emptyList')} />
        ) : null}

        {upcoming.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-500">
                    {[
                      '#',
                      t('cheque.number'),
                      t('cheque.party'),
                      t('cheque.bank'),
                      t('cheque.dueDate'),
                      t('common.amount'),
                      t('cheque.status'),
                      t('common.actions'),
                    ].map((header, index) => (
                      <th
                        key={header}
                        scope="col"
                        className={`border-y border-slate-200/80 px-4 py-2.5 text-[11px] font-semibold ${
                          index === 0 ? 'w-12 text-center' : 'text-start'
                        }`}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((cheque, index) => (
                    <tr key={cheque.id} className="group transition-colors hover:bg-slate-50/70">
                      <td className="border-b border-slate-100 px-4 py-3 text-center text-[13px] text-slate-400 tabular-nums">
                        {index + 1}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <Link
                          href={`/cheques/${cheque.id}`}
                          dir="ltr"
                          className="font-semibold text-slate-900 tabular-nums hover:text-teal-700"
                        >
                          {cheque.chequeNumber}
                        </Link>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 text-[13px] text-slate-700">
                        {cheque.originalSourceName ?? cheque.drawerName ?? '—'}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <BankMark name={cheque.bankName} size="sm" />
                          <span className="truncate text-[13px] text-slate-700">
                            {cheque.bankName ?? '—'}
                          </span>
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <span className="block text-[13px] font-medium text-slate-700 tabular-nums">
                          {formatDate(locale, cheque.dueDate)}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          <RelativeDue dueDate={cheque.dueDate} today={today} />
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-900 tabular-nums">
                        {money(locale, cheque.amount, cheque.currency)}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <DuePill
                          isOverdue={cheque.isOverdue}
                          dueDate={cheque.dueDate}
                          today={today}
                        />
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <Link
                          href={`/cheques/${cheque.id}`}
                          aria-label={`${t('common.view')} ${cheque.chequeNumber}`}
                          className="flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
                        >
                          <IconDots width="16" height="16" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Says what is not shown. The table is capped at five, and without
                this a person cannot tell five upcoming cheques from fifty. */}
            <p className="px-4 py-3 text-center text-[12px] text-slate-400">
              {t('dashboard.showingOfUpcoming', {
                shown: upcoming.length,
                total: upcomingAll.length,
              })}
            </p>
          </>
        ) : null}
      </section>
    </div>
  );
}

function CurrencyChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 rounded-lg px-4 text-sm font-semibold transition-colors ${
        active ? 'bg-teal-50 text-teal-900' : 'text-slate-500 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-[3px] w-4 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="px-2 py-1">
      <p className="text-[11px] font-medium text-slate-400">{label}</p>
      <p className={`mt-1 text-[15px] font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

/** "In 6 days", "tomorrow", "today" — the phrasing that decides whether to act. */
function RelativeDue({ dueDate, today }: { dueDate: string; today: string }) {
  const t = useTranslator();
  const days = Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );

  if (days < 0) return <>{t('due.lateDays', { days: Math.abs(days) })}</>;
  if (days === 0) return <>{t('due.today')}</>;
  if (days === 1) return <>{t('due.tomorrowShort')}</>;
  return <>{t('due.inDays', { days })}</>;
}

/**
 * How soon this cheque needs attention, as a coloured pill.
 *
 * Phrased in days-from-today rather than a date, because "in 2 days" is what
 * decides whether someone acts this morning.
 */
function DuePill({
  isOverdue,
  dueDate,
  today,
}: {
  isOverdue: boolean;
  dueDate: string;
  today: string;
}) {
  const t = useTranslator();
  const days = Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );

  const { label, className } = isOverdue
    ? { label: t('cheque.overdue'), className: 'bg-red-50 text-red-600' }
    : days <= 0
      ? { label: t('due.today'), className: 'bg-amber-50 text-amber-600' }
      : days <= 1
        ? { label: t('due.tomorrowShort'), className: 'bg-amber-50 text-amber-600' }
        : days <= 3
          ? { label: t('due.inDaysShort', { days }), className: 'bg-amber-50 text-amber-600' }
          : days <= 7
            ? { label: t('due.inDaysShort', { days }), className: 'bg-emerald-50 text-emerald-600' }
            : { label: t('due.inDays', { days }), className: 'bg-sky-50 text-sky-700' };

  return (
    <span className={`inline-flex rounded-lg px-2.5 py-1 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}
