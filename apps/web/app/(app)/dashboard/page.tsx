'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { utcToday, type DashboardSummary } from '@cheque-flow/shared-types';
import { EmptyState, ErrorState, LoadingState } from '@cheque-flow/ui';

import {
  IconAlert,
  IconCalendar,
  IconCamera,
  IconChevronEnd,
  IconClipboard,
  IconClock,
  IconPlus,
  IconWallet,
} from '@/components/icons';
import { LineChart } from '@/components/line-chart';
import { NotificationBell } from '@/components/notification-bell';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { formatDate, money } from '@/lib/format';

/** Reporting windows offered above the figures. */
const PERIODS = [
  { value: 30, labelKey: 'period.thisMonth' },
  { value: 60, labelKey: 'period.next30' },
  { value: 90, labelKey: 'period.next90' },
] as const;

const WEEK_LABEL_KEYS = ['week.current', 'week.next', 'week.third', 'week.fourth'];

/** `YYYY-MM-DD` shifted by whole days. */
function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The Monday of the week containing `iso`, matching how the API buckets weeks. */
function mondayOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return addDays(iso, -((date.getUTCDay() + 6) % 7));
}

export default function DashboardPage() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();

  const today = utcToday();
  const [currency, setCurrency] = useState<string | null>(null);
  const [withinDays, setWithinDays] = useState<number>(30);
  const [search, setSearch] = useState('');

  const dashboard = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  });

  const cashFlow = useQuery({
    queryKey: ['dashboard-cash-flow', withinDays],
    queryFn: () =>
      api.getCashFlowReport({ from: today, to: addDays(today, withinDays), granularity: 'week' }),
  });

  const due = useQuery({
    queryKey: ['dashboard-due', withinDays],
    queryFn: () => api.getDueReport({ withinDays }),
  });

  /** Currencies the organization actually holds, for the filter. */
  const currencies = useMemo(
    () => dashboard.data?.currencies.map((entry) => entry.currency) ?? [],
    [dashboard.data],
  );

  /**
   * The figures behind the cards.
   *
   * With a currency selected this is that currency's block. With "all"
   * selected the counts are added — a cheque is a cheque — while the money is
   * listed per currency rather than summed into a figure that means nothing.
   */
  const totals = useMemo(() => {
    const blocks = dashboard.data?.currencies ?? [];
    const chosen = currency ? blocks.filter((entry) => entry.currency === currency) : blocks;

    const bucket = (key: 'draft' | 'inHand' | 'dueWithin7Days' | 'overdue') => ({
      count: chosen.reduce((sum, entry) => sum + entry[key].count, 0),
      money: chosen
        .filter((entry) => entry[key].count > 0)
        .map((entry) => money(locale, entry[key].total, entry.currency))
        .join(' • '),
    });

    return {
      draft: bucket('draft'),
      inHand: bucket('inHand'),
      dueSoon: bucket('dueWithin7Days'),
      overdue: bucket('overdue'),
    };
  }, [dashboard.data, currency, locale]);

  /**
   * Weekly inflow and outflow for the chart, in the selected currency.
   *
   * The weeks are generated from the calendar, not taken from the response:
   * the report only returns periods that contain cheques, so a quiet fortnight
   * would collapse the chart into a couple of stray points instead of showing
   * the shape of the month.
   */
  const chart = useMemo(() => {
    const pick = currency ?? currencies[0];
    if (!pick) return null;

    const byPeriod = new Map(
      (cashFlow.data?.periods ?? []).map((period) => [
        period.period,
        period.byCurrency.find((row) => row.currency === pick),
      ]),
    );

    // The API buckets weeks by their Monday, so look up the same keys.
    const firstMonday = mondayOf(today);
    const inflow: number[] = [];
    const outflow: number[] = [];

    for (let week = 0; week < WEEK_LABEL_KEYS.length; week += 1) {
      const entry = byPeriod.get(addDays(firstMonday, week * 7));
      inflow.push(Number(entry?.inflow ?? 0));
      outflow.push(Number(entry?.outflow ?? 0));
    }

    return {
      currency: pick,
      labels: WEEK_LABEL_KEYS.map((key) => t(key)),
      series: [
        { label: t('dashboard.incoming'), values: inflow, color: '#2E9E92', fill: '#2E9E9214' },
        { label: t('dashboard.outgoing'), values: outflow, color: '#26356B' },
      ],
    };
  }, [cashFlow.data, currency, currencies, today, t]);

  const upcoming = (due.data?.cheques ?? [])
    .filter((cheque) => (currency ? cheque.currency === currency : true))
    .filter((cheque) =>
      search
        ? [cheque.chequeNumber, cheque.originalSourceName, cheque.bankName, cheque.drawerName]
            .filter(Boolean)
            .some((field) => field?.toLowerCase().includes(search.toLowerCase()))
        : true,
    )
    .slice(0, 8);

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

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t('dashboard.searchPlaceholder'),
        }}
        actions={
          <>
            <NotificationBell />
            <Link
              href="/cheques/new"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
            >
              <IconCamera />
              {t('cheque.captureNew')}
            </Link>
            <Link
              href="/cheques/new"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50"
            >
              <IconPlus />
              {t('cheque.addManually')}
            </Link>
          </>
        }
      />

      {/* Currency and period. Currency first because it changes what the
          numbers mean, not merely which ones are shown. */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div
          className="inline-flex rounded-xl border border-slate-200 bg-white p-1"
          role="group"
          aria-label={t('cheque.currency')}
        >
          <FilterChip
            label={t('cheque.tabAll')}
            active={currency === null}
            onClick={() => setCurrency(null)}
          />
          {currencies.map((code) => (
            <FilterChip
              key={code}
              label={code}
              active={currency === code}
              onClick={() => setCurrency(code)}
            />
          ))}
        </div>

        <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600">
          <IconCalendar className="text-slate-400" />
          <span className="sr-only">{t('common.period')}</span>
          <select
            value={withinDays}
            onChange={(event) => setWithinDays(Number(event.target.value))}
            className="bg-transparent pe-1 text-sm font-medium text-slate-700 outline-none"
          >
            {PERIODS.map((period) => (
              <option key={period.value} value={period.value}>
                {t(period.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('dashboard.draft')}
          value={String(totals.draft.count)}
          hint={totals.draft.money}
          Icon={IconClipboard}
        />
        <StatCard
          label={t('dashboard.inHandCount')}
          value={String(totals.inHand.count)}
          hint={totals.inHand.money}
          tone="teal"
          Icon={IconWallet}
        />
        <StatCard
          label={t('dashboard.dueWithin7Days')}
          value={String(totals.dueSoon.count)}
          hint={totals.dueSoon.money}
          tone="amber"
          Icon={IconCalendar}
        />
        <StatCard
          label={t('dashboard.overdue')}
          value={String(totals.overdue.count)}
          hint={totals.overdue.money || t('dashboard.needsFollowUp')}
          tone="red"
          Icon={IconAlert}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">
              {t('dashboard.cashFlowUpcoming')}
            </h2>
            {chart ? (
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <Legend color="#2E9E92" label={t('dashboard.incoming')} />
                <Legend color="#26356B" label={t('dashboard.outgoing')} />
              </div>
            ) : null}
          </div>

          {cashFlow.isPending ? <LoadingState label={t('common.loading')} /> : null}
          {chart ? (
            <>
              <LineChart
                series={chart.series}
                labels={chart.labels}
                axisLabel={`${t('dashboard.amountAxis')} (${chart.currency})`}
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
            </>
          ) : cashFlow.isPending ? null : (
            <EmptyState title={t('reports.empty')} />
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-base font-bold text-slate-900">{t('dashboard.needsAction')}</h2>
          <ul className="flex flex-col gap-2.5">
            <ActionRow
              tone="red"
              Icon={IconAlert}
              count={totals.overdue.count}
              label={t('dashboard.overdue')}
              actionLabel={t('common.review')}
              href="/cheques/due"
            />
            <ActionRow
              tone="amber"
              Icon={IconClock}
              count={totals.draft.count}
              label={t('dashboard.draft')}
              actionLabel={t('common.confirm2')}
              href="/cheques/review"
            />
            <ActionRow
              tone="teal"
              Icon={IconCalendar}
              count={totals.dueSoon.count}
              label={t('dashboard.dueThisWeek')}
              actionLabel={t('common.view')}
              href="/cheques/due"
            />
          </ul>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
          <h2 className="text-base font-bold text-slate-900">{t('dashboard.upcomingCheques')}</h2>
          <Link
            href="/cheques"
            className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-900"
          >
            {t('common.viewAll')}
            <IconChevronEnd width="16" height="16" />
          </Link>
        </div>

        {due.isPending ? <LoadingState label={t('common.loading')} /> : null}

        {!due.isPending && upcoming.length === 0 ? (
          <EmptyState title={t('cheque.emptyList')} />
        ) : null}

        {upcoming.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-slate-500">
                  {[
                    'cheque.number',
                    'cheque.party',
                    'cheque.bank',
                    'cheque.dueDate',
                    'common.amount',
                    'cheque.status',
                  ].map((key) => (
                    <th key={key} scope="col" className="p-4 text-start text-xs font-medium">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {upcoming.map((cheque) => (
                  <tr key={cheque.id} className="hover:bg-slate-50">
                    <td className="p-4">
                      <Link
                        href={`/cheques/${cheque.id}`}
                        className="font-semibold text-slate-900 tabular-nums hover:text-teal-700"
                        dir="ltr"
                      >
                        {cheque.chequeNumber}
                      </Link>
                    </td>
                    <td className="p-4 text-slate-700">
                      {cheque.originalSourceName ?? cheque.drawerName ?? '—'}
                    </td>
                    <td className="p-4 text-slate-700">{cheque.bankName ?? '—'}</td>
                    <td className="p-4 text-slate-600 tabular-nums">
                      {formatDate(locale, cheque.dueDate)}
                    </td>
                    <td className="p-4 font-semibold text-slate-900 tabular-nums">
                      {money(locale, cheque.amount, cheque.currency)}
                    </td>
                    <td className="p-4">
                      <DuePill
                        isOverdue={cheque.isOverdue}
                        dueDate={cheque.dueDate}
                        today={today}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function FilterChip({
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
        active ? 'bg-teal-800 text-white' : 'text-slate-600 hover:bg-slate-50'
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
        className="inline-block h-0.5 w-5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

const ACTION_TONES = {
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
  teal: 'bg-teal-50 text-teal-700',
} as const;

function ActionRow({
  tone,
  Icon,
  count,
  label,
  actionLabel,
  href,
}: {
  tone: keyof typeof ACTION_TONES;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  count: number;
  label: string;
  actionLabel: string;
  href: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
      >
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${ACTION_TONES[tone]}`}
        >
          <Icon width="18" height="18" />
        </span>
        <span className="min-w-0 flex-1 text-sm text-slate-700">
          <span className="font-bold text-slate-900 tabular-nums">{count}</span> {label}
        </span>
        <span className="shrink-0 text-sm font-semibold text-teal-700">{actionLabel}</span>
      </Link>
    </li>
  );
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
    ? { label: t('cheque.overdue'), className: 'bg-red-50 text-red-700' }
    : days <= 0
      ? { label: t('due.today'), className: 'bg-amber-50 text-amber-700' }
      : days === 1
        ? { label: t('due.tomorrowShort'), className: 'bg-amber-50 text-amber-700' }
        : days === 2
          ? { label: t('due.twoDays'), className: 'bg-amber-50 text-amber-700' }
          : { label: t('due.inDaysShort', { days }), className: 'bg-teal-50 text-teal-700' };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}
