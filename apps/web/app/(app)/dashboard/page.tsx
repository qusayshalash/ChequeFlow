'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { headlineTotal, addMoney, type DashboardSummary } from '@cheque-flow/shared-types';
import { EmptyState, ErrorState, LoadingState } from '@cheque-flow/ui';

import { loadErrorRequestId, loadErrorTitle } from '@/lib/query-error';
import { BankMark } from '@/components/bank-mark';
import {
  IconAlert,
  IconCalendar,
  IconCheque,
  IconChevronEnd,
  IconClock,
  IconDots,
} from '@/components/icons';
import { BalanceCurve } from '@/components/balance-curve';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { formatDate, formatDayMonth, money } from '@/lib/format';
import { useToday } from '@/lib/today';

/** How far ahead the projected balance looks, in days from today. */
const HORIZONS = [
  { days: 30, labelKey: 'dashboard.next30Days' },
  { days: 7, labelKey: 'dashboard.next7Days' },
  { days: 90, labelKey: 'dashboard.next90Days' },
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

  const today = useToday();
  const [currency, setCurrency] = useState<string | null>(null);
  // Incoming by default; outgoing on request. Shown one side at a time so
  // the card keeps its single line, and remembered on this browser only.
  const [direction, setDirection] = useState<'incoming' | 'outgoing'>('incoming');
  // Read after the first render: the server renders without storage, and a
  // different first frame on the client would be a hydration mismatch.
  useEffect(() => {
    try {
      if (window.localStorage.getItem('dashboard.direction') === 'outgoing') {
        setDirection('outgoing');
      }
    } catch {
      // Private mode or blocked storage: incoming, as for a first visit.
    }
  }, []);
  const chooseDirection = (next: 'incoming' | 'outgoing') => {
    setDirection(next);
    try {
      window.localStorage.setItem('dashboard.direction', next);
    } catch {
      // Private mode or blocked storage: the choice simply lasts this visit.
    }
  };
  const [horizon, setHorizon] = useState<number>(30);
  const forecastTo = addDays(today, horizon);

  const dashboard = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  });

  // What is coming, day by day: the projected balance and the net figure at
  // the top are both read off it. It starts today; cheques already overdue
  // are on the cards below, not folded into a forecast as if they were dated.
  const forecast = useQuery({
    queryKey: ['dashboard-forecast', today, forecastTo],
    queryFn: () => api.getCashFlowReport({ from: today, to: forecastTo, granularity: 'day' }),
  });

  // Deliberately not tied to the forecast's horizon. "What is coming" in the
  // table is the next few cheques, however far out the first one is.
  const due = useQuery({
    queryKey: ['dashboard-due'],
    queryFn: () => api.getDueReport({ from: today, to: addDays(today, 90), includeOverdue: false }),
  });

  const risk = useQuery({
    queryKey: ['dashboard-contact-risk'],
    queryFn: () => api.getContactRisk(),
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

    const bucket = (
      key: 'draft' | 'dueWithin7Days' | 'overdue' | 'bounced' | 'cleared' | 'deposited',
    ) => ({
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
      deposited: bucket('deposited'),
    };
  }, [dashboard.data, currency, locale]);

  /**
   * The projected balance, one point per day from today to the horizon.
   *
   * Days come from the calendar, not the response: the report returns only
   * days with cheques on them, and a quiet stretch is a flat line, not a gap.
   * The running total is kept as a money string; the numbers handed to the
   * curve are for drawing only.
   */
  const projection = useMemo(() => {
    // With "all" chosen, the currency the coming weeks are actually in: the
    // first listed one may have nothing ahead, and a forecast of zero dollars
    // beside a month of shekel cheques reads as "nothing coming".
    const ahead = new Set(
      (forecast.data?.periods ?? []).flatMap((period) =>
        period.byCurrency.map((row) => row.currency),
      ),
    );
    const pick =
      currency ??
      currencies.find((code) => ahead.has(code)) ??
      dashboard.data?.defaultCurrency ??
      currencies[0];
    if (!pick) return null;
    const byDay = new Map(
      (forecast.data?.periods ?? []).map((period) => [
        period.period,
        period.byCurrency.find((row) => row.currency === pick),
      ]),
    );
    const days = daysBetween(today, forecastTo);
    let running = '0.00';
    const points = days.map((day) => {
      running = addMoney([running, byDay.get(day)?.net ?? '0.00']);
      return { day, balance: running };
    });
    const low = points.reduce(
      (lowest, point) => (Number(point.balance) < Number(lowest.balance) ? point : lowest),
      points[0] ?? { day: today, balance: '0.00' },
    );
    return {
      currency: pick,
      points,
      low,
      inflow: addMoney(days.map((day) => byDay.get(day)?.inflow)),
      outflow: addMoney(days.map((day) => byDay.get(day)?.outflow)),
      net: running,
    };
  }, [forecast.data, currency, currencies, dashboard.data, today, forecastTo]);

  const upcomingAll = (due.data?.cheques ?? []).filter((cheque) =>
    currency ? cheque.currency === currency : true,
  );
  const upcoming = upcomingAll.slice(0, 5);

  if (dashboard.isPending) return <LoadingState label={t('common.loading')} />;
  if (dashboard.isError || !dashboard.data) {
    return (
      <ErrorState
        title={loadErrorTitle(t, dashboard.error)}
        requestId={loadErrorRequestId(dashboard.error)}
        onRetry={() => void dashboard.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const headline = headlineTotal(dashboard.data, currency);

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={
          currencies.length > 1 ? (
            <div
              className="inline-flex rounded-xl border border-line bg-surface p-1"
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

      {/* The liquidity line: what the coming weeks add up to, in one figure,
          with what makes it up beside it. */}
      {projection ? (
        <section className="mb-4 grid grid-cols-3 gap-x-3 gap-y-4 rounded-2xl border border-line/90 bg-gradient-to-bl from-surface-raised to-surface p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:gap-5 sm:p-5">
          <div className="col-span-3 sm:col-span-1">
            <p className="text-xs text-ink-muted">{t('dashboard.netAhead', { days: horizon })}</p>
            <p
              dir="ltr"
              className={`mt-1 text-end text-3xl font-bold tabular-nums sm:text-4xl ${
                projection.net.startsWith('-') ? 'text-danger' : 'text-primary-ink'
              }`}
            >
              {money(locale, projection.net, projection.currency)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {t('dashboard.netParts', {
                inflow: money(locale, projection.inflow, projection.currency),
                outflow: money(locale, projection.outflow, projection.currency),
              })}
            </p>
          </div>
          <HeroFigure
            label={t('dashboard.dueWithin7Days')}
            value={String(totals.dueSoon.count)}
            note={totals.dueSoon.money || '—'}
            tone="text-warning"
          />
          <HeroFigure
            label={t('dashboard.atBank')}
            value={String(totals.deposited.count)}
            note={totals.deposited.money || '—'}
            tone="text-ink-muted"
          />
          <HeroFigure
            label={t('dashboard.bouncedCheques')}
            value={String(totals.bounced.count)}
            note={totals.bounced.money || '—'}
            tone="text-danger"
            valueTone={totals.bounced.count > 0 ? 'text-danger' : undefined}
          />
        </section>
      ) : null}

      {/* Four headline figures, largest scope first: everything, then what is
          coming, then what is late, then what is not yet confirmed. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={
            direction === 'incoming' ? t('dashboard.totalIncoming') : t('dashboard.totalOutgoing')
          }
          value={String(headline[direction].count)}
          amountLabel={t('dashboard.totalAmount')}
          amount={
            headline[direction].amounts
              .map((entry) => money(locale, entry.total, entry.currency))
              .join(' · ') || undefined
          }
          tone="teal"
          Icon={IconCheque}
          href={direction === 'incoming' ? '/cheques?tab=INCOMING' : '/cheques?tab=OUTGOING'}
          menu={{
            label: t('common.actions'),
            items: [
              {
                key: 'incoming',
                label: t('cheque.tabIncoming'),
                active: direction === 'incoming',
                onSelect: () => chooseDirection('incoming'),
              },
              {
                key: 'outgoing',
                label: t('cheque.tabOutgoing'),
                active: direction === 'outgoing',
                onSelect: () => chooseDirection('outgoing'),
              },
            ],
          }}
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

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,1fr)] xl:items-stretch">
        <section className="min-w-0 rounded-2xl border border-line/90 bg-surface p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-ink">{t('dashboard.projectedTitle')}</h2>
              <p className="mt-0.5 text-xs text-ink-muted">{t('dashboard.projectedHint')}</p>
            </div>
            <label className="inline-flex h-9 items-center gap-2 rounded-xl border border-line px-3 text-[13px] font-semibold text-ink-soft hover:border-line-strong">
              <IconCalendar width="15" height="15" className="text-ink-muted" />
              <select
                className="bg-transparent pe-1 outline-none"
                value={horizon}
                onChange={(event) => setHorizon(Number(event.target.value))}
                aria-label={t('common.period')}
              >
                {HORIZONS.map((entry) => (
                  <option key={entry.days} value={entry.days}>
                    {t(entry.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {forecast.isPending ? <LoadingState label={t('common.loading')} /> : null}
          {projection && !forecast.isPending ? (
            <>
              <BalanceCurve
                values={projection.points.map((point) => Number(point.balance))}
                ariaLabel={t('dashboard.projectedTitle')}
              />
              <div className="mt-1 flex justify-between text-[11px] text-ink-muted tabular-nums">
                <span>{formatDayMonth(locale, today)}</span>
                <span>{formatDayMonth(locale, forecastTo)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {Number(projection.low.balance) < 0 ? (
                  <span className="rounded-lg bg-danger-soft px-2.5 py-1.5 font-bold text-danger">
                    {t('dashboard.lowestPoint', { date: formatDate(locale, projection.low.day) })}{' '}
                    <span dir="ltr">
                      {money(locale, projection.low.balance, projection.currency)}
                    </span>
                  </span>
                ) : (
                  <span className="rounded-lg bg-success-soft px-2.5 py-1.5 font-bold text-success">
                    {t('dashboard.neverShort')}
                  </span>
                )}
                <span className="text-ink-muted">{t('dashboard.zeroLine')}</span>
              </div>
            </>
          ) : null}
        </section>

        <section className="min-w-0 rounded-2xl border border-line/90 bg-surface p-4 sm:p-5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-bold text-ink">{t('dashboard.riskTitle')}</h2>
            <span className="text-xs text-ink-muted">{t('dashboard.riskOrder')}</span>
          </div>
          {risk.isPending ? <LoadingState label={t('common.loading')} /> : null}
          {risk.data && risk.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t('dashboard.riskEmpty')}</p>
          ) : null}
          <ul className="divide-y divide-line">
            {(risk.data ?? []).map((entry) => (
              <li key={entry.contactId}>
                <Link
                  href={`/contacts/${entry.contactId}`}
                  className="flex items-center gap-3 py-3 hover:bg-subtle/40"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-subtle text-sm font-bold text-ink-soft">
                    {entry.name.trim().charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {entry.name}
                    </span>
                    <span className="block text-[11px] text-ink-muted">
                      {entry.decided > 0
                        ? t('dashboard.riskLine', {
                            rate: Math.round((entry.bounced / entry.decided) * 100),
                            open: entry.openBounced,
                          })
                        : t('dashboard.riskNew')}
                    </span>
                    <span
                      className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${RISK_TONE[entry.level]}`}
                    >
                      {t(`dashboard.risk.${entry.level}`)}
                    </span>
                  </span>
                  <span className="shrink-0 text-end text-[13px] font-bold text-ink tabular-nums">
                    {entry.outstanding.map((row) => (
                      <span key={row.currency} className="block" dir="ltr">
                        {money(locale, row.total, row.currency)}
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-2xl border border-line/90 bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <Link
            href="/cheques"
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border border-line px-3 text-[13px] font-semibold text-ink-soft transition hover:border-line-strong hover:bg-subtle"
          >
            {t('dashboard.viewAllCheques')}
            <IconChevronEnd width="15" height="15" />
          </Link>
          <h2 className="text-[15px] font-bold text-ink">{t('dashboard.upcomingTitle')}</h2>
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
                  <tr className="bg-subtle/80 text-ink-muted">
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
                        className={`border-y border-line/80 px-4 py-2.5 text-[11px] font-semibold ${
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
                    <tr key={cheque.id} className="group transition-colors hover:bg-subtle/70">
                      <td className="border-b border-line-soft px-4 py-3 text-center text-[13px] text-ink-muted tabular-nums">
                        {index + 1}
                      </td>
                      <td className="border-b border-line-soft px-4 py-3">
                        <Link
                          href={`/cheques/${cheque.id}`}
                          dir="ltr"
                          className="font-semibold text-ink tabular-nums hover:text-primary-ink"
                        >
                          {cheque.chequeNumber}
                        </Link>
                      </td>
                      <td className="border-b border-line-soft px-4 py-3 text-[13px] text-ink-soft">
                        {cheque.originalSourceName ?? cheque.drawerName ?? '—'}
                      </td>
                      <td className="border-b border-line-soft px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <BankMark name={cheque.bankName} size="sm" />
                          <span className="truncate text-[13px] text-ink-soft">
                            {cheque.bankName ?? '—'}
                          </span>
                        </span>
                      </td>
                      <td className="border-b border-line-soft px-4 py-3">
                        <span className="block text-[13px] font-medium text-ink-soft tabular-nums">
                          {formatDate(locale, cheque.dueDate)}
                        </span>
                        <span className="block text-[11px] text-ink-muted">
                          <RelativeDue dueDate={cheque.dueDate} today={today} />
                        </span>
                      </td>
                      <td className="border-b border-line-soft px-4 py-3 font-semibold text-ink tabular-nums">
                        {money(locale, cheque.amount, cheque.currency)}
                      </td>
                      <td className="border-b border-line-soft px-4 py-3">
                        <DuePill
                          isOverdue={cheque.isOverdue}
                          dueDate={cheque.dueDate}
                          today={today}
                        />
                      </td>
                      <td className="border-b border-line-soft px-4 py-3">
                        <Link
                          href={`/cheques/${cheque.id}`}
                          aria-label={`${t('common.view')} ${cheque.chequeNumber}`}
                          className="flex size-8 items-center justify-center rounded-lg border border-line text-ink-muted transition hover:bg-subtle hover:text-ink-soft"
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
            <p className="px-4 py-3 text-center text-[12px] text-ink-muted">
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
        active ? 'bg-primary-soft text-primary-ink' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

const RISK_TONE = {
  high: 'bg-danger-soft text-danger',
  medium: 'bg-warning-soft text-warning',
  low: 'bg-success-soft text-success',
} as const;

function HeroFigure({
  label,
  value,
  note,
  tone,
  valueTone,
}: {
  label: string;
  value: string;
  note: string;
  tone: string;
  valueTone?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-ink-muted sm:text-xs">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums sm:text-3xl ${valueTone ?? 'text-ink'}`}>
        {value}
      </p>
      <p className={`mt-1 truncate text-[11px] tabular-nums sm:text-xs ${tone}`} title={note}>
        {note}
      </p>
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
    ? { label: t('cheque.overdue'), className: 'bg-danger-soft text-danger' }
    : days <= 0
      ? { label: t('due.today'), className: 'bg-warning-soft text-warning' }
      : days <= 1
        ? { label: t('due.tomorrowShort'), className: 'bg-warning-soft text-warning' }
        : days <= 3
          ? { label: t('due.inDaysShort', { days }), className: 'bg-warning-soft text-warning' }
          : days <= 7
            ? { label: t('due.inDaysShort', { days }), className: 'bg-success-soft text-success' }
            : { label: t('due.inDays', { days }), className: 'bg-info-soft text-info' };

  return (
    <span className={`inline-flex rounded-lg px-2.5 py-1 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}
