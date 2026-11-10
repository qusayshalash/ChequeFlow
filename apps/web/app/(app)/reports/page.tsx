'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  Permission,
  addMoney,
  isNegativeMoney,
  isZeroMoney,
  subtractMoney,
} from '@cheque-flow/shared-types';
import { EmptyState, ErrorState, LoadingState } from '@cheque-flow/ui';

import { IconAlert, IconCalendar, IconReturn, IconSafe, IconShield } from '@/components/icons';
import { loadErrorRequestId, loadErrorTitle } from '@/lib/query-error';
import { LineChart } from '@/components/line-chart';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { RequirePermission, useSession } from '@/components/session';
import { Tabs } from '@/components/tabs';
import { formatDate, formatDayMonth, money } from '@/lib/format';
import { useToday } from '@/lib/today';

/**
 * The windows on offer.
 *
 * Two look back and two look forward, because the two questions this page
 * answers are different: "what happened" and "what is coming". The old page
 * hard-coded today→+90 days weekly and gave no way to change it, so it could
 * only ever answer the second.
 */
const RANGES = [
  { key: 'last30', labelKey: 'reports.last30', from: -30, to: 0 },
  { key: 'next30', labelKey: 'reports.next30', from: 0, to: 30 },
  { key: 'next90', labelKey: 'reports.next90', from: 0, to: 90 },
  { key: 'year', labelKey: 'reports.thisYear', from: -180, to: 180 },
] as const;

const GRAINS = [
  { key: 'day', labelKey: 'reports.periodDay' },
  { key: 'week', labelKey: 'reports.periodWeek' },
  { key: 'month', labelKey: 'reports.periodMonth' },
] as const;

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The Monday on or before `iso`, which is how the API buckets weeks. */
function mondayOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return addDays(iso, -((date.getUTCDay() + 6) % 7));
}

/**
 * Every period between two dates, whether or not anything happened in one.
 *
 * The report only returns periods that contain cheques, so a quiet fortnight
 * came back as nothing at all and the line jumped straight from one busy week
 * to the next — ninety days rendered as three points, which reads as a trend
 * that is not there. Generating the axis from the calendar puts the flat
 * stretches back.
 */
function periodsBetween(from: string, to: string, grain: 'day' | 'week' | 'month'): string[] {
  const out: string[] = [];

  if (grain === 'month') {
    let cursor = `${from.slice(0, 7)}-01`;
    while (cursor <= to) {
      out.push(cursor);
      const [year, month] = cursor.split('-').map(Number) as [number, number];
      cursor =
        month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    }
    return out;
  }

  const step = grain === 'week' ? 7 : 1;
  for (let day = grain === 'week' ? mondayOf(from) : from; day <= to; day = addDays(day, step)) {
    out.push(day);
  }
  return out;
}

export default function ReportsPagePage() {
  return (
    <RequirePermission permission={Permission.REPORT_VIEW}>
      <ReportsPageBody />
    </RequirePermission>
  );
}

function ReportsPageBody() {
  const api = useApi();
  const t = useTranslator();
  const { data: session } = useSession();
  const canAudit = session?.permissions.includes(Permission.AUDIT_VIEW) ?? false;
  const { locale } = useApp();

  const today = useToday();
  const [rangeKey, setRangeKey] = useState<string>('next90');
  const [grain, setGrain] = useState<'day' | 'week' | 'month'>('week');
  const [currency, setCurrency] = useState<string | null>(null);

  const range = RANGES.find((entry) => entry.key === rangeKey) ?? RANGES[2];
  const from = addDays(today, range.from);
  const to = addDays(today, range.to);

  const cashFlow = useQuery({
    queryKey: ['reports', 'cash-flow', from, to, grain],
    queryFn: () => api.getCashFlowReport({ from, to, granularity: grain }),
  });
  const bounced = useQuery({
    queryKey: ['reports', 'bounced'],
    queryFn: () => api.getBouncedReport(),
  });
  const custody = useQuery({
    queryKey: ['reports', 'custody'],
    queryFn: () => api.getCustodyReport(),
  });
  // The due report was not on this page at all — the one report that answers
  // "what do I have to collect", missing from the reports screen.
  const due = useQuery({
    queryKey: ['reports', 'due', from, to],
    queryFn: () => api.getDueReport({ from, to, includeOverdue: true }),
  });

  /** Currencies that actually appear in the window, in a stable order. */
  const currencies = useMemo(() => {
    const seen = new Set<string>();
    for (const period of cashFlow.data?.periods ?? []) {
      for (const row of period.byCurrency) seen.add(row.currency);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [cashFlow.data]);

  const shown = currency ?? currencies[0] ?? null;

  /**
   * The chart and the figures under it, for one currency.
   *
   * One currency at a time on purpose. Adding a dollar inflow to a shekel
   * inflow produces a number that means nothing, so the currency is a filter
   * rather than a series — the same rule the rest of the app follows.
   */
  const chart = useMemo(() => {
    if (!shown) return null;
    if (!cashFlow.data) return null;

    // Indexed by the API's own period key, then read back against a calendar
    // axis so the empty stretches are drawn rather than skipped.
    const byPeriod = new Map(
      cashFlow.data.periods.map((period) => [
        period.period,
        period.byCurrency.find((entry) => entry.currency === shown),
      ]),
    );

    const rows = periodsBetween(from, to, grain).map((period) => ({
      period,
      row: byPeriod.get(period),
    }));
    if (rows.length === 0) return null;

    const inflow = rows.map((entry) => Number(entry.row?.inflow ?? 0));
    const outflow = rows.map((entry) => Number(entry.row?.outflow ?? 0));

    // Everything after today is forecast, not fact: those cheques are dated,
    // not banked. The line says so by going dashed.
    const futureFrom = rows.findIndex((entry) => entry.period > today);

    // Totals from the API's strings, not from the chart's numbers: those are
    // floats, fine for drawing a line and wrong in the last cent of a sum.
    const totalIn = addMoney(rows.map((entry) => entry.row?.inflow));
    const totalOut = addMoney(rows.map((entry) => entry.row?.outflow));

    // The question the lines leave the reader to work out: which periods
    // pay out more than they take in, and where the running total stands.
    // Only periods with a cheque in them; a quarter of empty days is noise.
    let running = '0.00';
    const table = rows.flatMap((entry) => {
      const inflow = entry.row?.inflow ?? '0.00';
      const outflow = entry.row?.outflow ?? '0.00';
      const net = subtractMoney(inflow, outflow);
      running = addMoney([running, net]);
      if (isZeroMoney(inflow) && isZeroMoney(outflow)) return [];
      return [
        {
          period: entry.period,
          label:
            grain === 'month'
              ? entry.period.slice(0, 7)
              : grain === 'week'
                ? `${formatDayMonth(locale, entry.period)} – ${formatDayMonth(locale, addDays(entry.period, 6))}`
                : formatDate(locale, entry.period),
          inflow,
          outflow,
          net,
          running,
          short: isNegativeMoney(net),
        },
      ];
    });

    return {
      labels: rows.map((entry) =>
        grain === 'month' ? entry.period.slice(0, 7) : formatDayMonth(locale, entry.period),
      ),
      series: [
        {
          label: t('reports.inflow'),
          values: inflow,
          color: 'var(--app-primary)',
          ...(futureFrom >= 0 ? { dashedFrom: futureFrom } : {}),
        },
        {
          label: t('reports.outflow'),
          values: outflow,
          color: 'var(--app-danger-solid)',
          ...(futureFrom >= 0 ? { dashedFrom: futureFrom } : {}),
        },
      ],
      totals: { inflow: totalIn, outflow: totalOut, net: subtractMoney(totalIn, totalOut) },
      table,
      empty: isZeroMoney(totalIn) && isZeroMoney(totalOut),
    };
  }, [cashFlow.data, shown, grain, from, to, today, locale, t]);

  const custodyTotal = custody.data?.count ?? 0;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <PageHeader title={t('reports.title')} subtitle={t('pageDescription.reports')} />

      {/* The other reports, which used to be found only by knowing the URL or
          spotting a card halfway down: each with the figure it answers. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ReportLink
          href="/reports/deposit-slip"
          Icon={IconSafe}
          title={t('reports.depositSlipTitle')}
          note={t('reports.depositSlipShort')}
        />
        <ReportLink
          href="/reports/bounced"
          Icon={IconReturn}
          title={t('bounced.title')}
          note={
            bounced.data
              ? bounced.data.count === 0
                ? t('bounced.empty')
                : bounced.data.byCurrency
                    .map((entry) => money(locale, entry.remaining, entry.currency))
                    .join(' · ')
              : '…'
          }
          tone={bounced.data && bounced.data.count > 0 ? 'danger' : 'neutral'}
        />
        {canAudit ? (
          <ReportLink
            href="/audit"
            Icon={IconShield}
            title={t('nav.auditLogs')}
            note={t('reports.auditShort')}
          />
        ) : null}
      </div>

      {/* Controls. The old page had none: the window, the grouping and the
          currency were all fixed in the source. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* A full row on a phone: beside the grouping it had 175px, and the
            period names were cut at the edge. */}
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <Tabs
            tabs={RANGES.map((entry) => ({ key: entry.key, label: t(entry.labelKey) }))}
            active={rangeKey}
            onChange={setRangeKey}
          />
        </div>

        <label className="inline-flex h-11 w-40 items-center gap-2 rounded-xl border border-line bg-surface px-3 hover:border-line-strong">
          <span className="text-xs font-medium text-ink-muted">{t('reports.granularity')}</span>
          <select
            className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold text-ink-soft outline-none"
            value={grain}
            onChange={(event) => setGrain(event.target.value as typeof grain)}
          >
            {GRAINS.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {t(entry.labelKey)}
              </option>
            ))}
          </select>
        </label>

        {currencies.length > 1 ? (
          <div className="inline-flex rounded-xl bg-sunken/80 p-1" role="group">
            {currencies.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setCurrency(code)}
                aria-pressed={code === shown}
                className={`h-9 rounded-lg px-4 text-sm font-semibold transition-colors ${
                  code === shown
                    ? 'bg-surface text-ink shadow-sm ring-1 ring-line'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-ink-muted">
        {formatDate(locale, from)} — {formatDate(locale, to)} · {t('reports.perCurrencyNote')}
      </p>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)] xl:items-start">
        <div className="min-w-0">
          {/* ── Cash flow ─────────────────────────────────────────────────── */}
          <Panel title={`${t('reports.cashFlowTitle')}${shown ? ` — ${shown}` : ''}`}>
            <p className="-mt-1 mb-3 text-sm text-ink-muted">{t('reports.cashFlowHint')}</p>

            {cashFlow.isPending ? <LoadingState label={t('common.loading')} /> : null}
            {cashFlow.isError ? (
              <ErrorState
                title={loadErrorTitle(t, cashFlow.error)}
                requestId={loadErrorRequestId(cashFlow.error)}
                onRetry={() => void cashFlow.refetch()}
                retryLabel={t('common.retry')}
              />
            ) : null}

            {!cashFlow.isPending && !chart ? <EmptyState title={t('reports.empty')} /> : null}

            {chart ? (
              <>
                {chart.empty ? (
                  <p className="mb-3 rounded-xl bg-subtle px-4 py-3 text-sm text-ink-muted">
                    {t('reports.noCurrencyData')}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-4 text-[11px] text-ink-muted">
                  {chart.series.map((entry) => (
                    <span key={entry.label} className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="inline-block h-[3px] w-4 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      {entry.label}
                    </span>
                  ))}
                </div>

                <LineChart
                  series={chart.series}
                  labels={chart.labels}
                  height={240}
                  showPoints={chart.labels.length <= 16}
                  labelEvery={Math.max(1, Math.round(chart.labels.length / 7))}
                />

                <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-line/70 sm:grid-cols-3">
                  <Figure
                    label={t('reports.inflow')}
                    value={money(locale, chart.totals.inflow, shown!)}
                    tone="text-primary-ink"
                  />
                  <Figure
                    label={t('reports.outflow')}
                    value={money(locale, chart.totals.outflow, shown!)}
                    tone="text-danger"
                  />
                  <Figure
                    label={t('reports.net')}
                    value={money(locale, chart.totals.net, shown!)}
                    tone={isNegativeMoney(chart.totals.net) ? 'text-danger' : 'text-primary-ink'}
                  />
                </div>

                {chart.table.length > 0 ? (
                  <ForecastTable rows={chart.table} currency={shown!} />
                ) : null}
              </>
            ) : null}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {/* ── Due in the window ─────────────────────────────────────────── */}
          <Panel title={t('reports.dueTitle')}>
            <p className="-mt-1 mb-3 text-sm text-ink-muted">{t('reports.dueHint')}</p>

            {due.isPending ? <LoadingState label={t('common.loading')} /> : null}

            {due.data ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Callout
                  Icon={IconCalendar}
                  tone="teal"
                  count={due.data.count}
                  label={t('reports.dueTitle')}
                  lines={due.data.byCurrency.map(
                    (entry) => `${money(locale, entry.total, entry.currency)}`,
                  )}
                />
                <Callout
                  Icon={IconAlert}
                  tone="red"
                  count={due.data.overdueCount}
                  label={t('cheque.tabOverdue')}
                  lines={due.data.overdueByCurrency.map(
                    (entry) => `${money(locale, entry.total, entry.currency)}`,
                  )}
                />
              </div>
            ) : null}
          </Panel>

          {/* ── Custody ───────────────────────────────────────────────────── */}
          <Panel title={t('reports.custodyTitle')}>
            <p className="-mt-1 mb-3 text-sm text-ink-muted">{t('reports.custodyHint')}</p>

            {custody.isPending ? <LoadingState label={t('common.loading')} /> : null}
            {custody.isError ? (
              <ErrorState
                title={loadErrorTitle(t, custody.error)}
                requestId={loadErrorRequestId(custody.error)}
                onRetry={() => void custody.refetch()}
                retryLabel={t('common.retry')}
              />
            ) : null}

            {custody.data && custody.data.entries.length === 0 ? (
              <EmptyState title={t('reports.empty')} />
            ) : null}

            <div className="flex flex-col gap-3">
              {(custody.data?.entries ?? []).map((entry, index) => {
                const share = custodyTotal > 0 ? entry.count / custodyTotal : 0;
                return (
                  <div key={index} className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <IconSafe width="16" height="16" className="text-ink-muted" />
                        {entry.locationName ?? entry.holderName ?? t('common.unknown')}
                      </span>
                      <span className="text-xs text-ink-muted tabular-nums">
                        {entry.count} · {Math.round(share * 100)}% {t('reports.ofTotal')}
                      </span>
                    </div>

                    {/* A bar, not just a number. "Twenty in the safe" means little
                    until you can see it is most of them. */}
                    <div className="h-2 overflow-hidden rounded-full bg-sunken">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(share * 100, 2)}%` }}
                      />
                    </div>

                    <p className="text-xs text-ink-muted tabular-nums">
                      {entry.byCurrency
                        .map((row) => money(locale, row.total, row.currency))
                        .join(' · ')}
                    </p>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ForecastTable({
  rows,
  currency,
}: {
  rows: Array<{
    period: string;
    label: string;
    inflow: string;
    outflow: string;
    net: string;
    running: string;
    short: boolean;
  }>;
  currency: string;
}) {
  const t = useTranslator();
  const { locale } = useApp();
  const shortCount = rows.filter((row) => row.short).length;
  return (
    <div className="mt-5">
      <p
        className={`mb-2 text-sm font-semibold ${shortCount > 0 ? 'text-danger' : 'text-ink-muted'}`}
      >
        {shortCount > 0
          ? t('reports.shortPeriods', { count: shortCount })
          : t('reports.noShortPeriods')}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th className="py-2 text-start font-semibold">{t('reports.period')}</th>
              <th className="py-2 text-end font-semibold">{t('reports.inflow')}</th>
              <th className="py-2 text-end font-semibold">{t('reports.outflow')}</th>
              <th className="py-2 text-end font-semibold">{t('reports.net')}</th>
              <th className="py-2 text-end font-semibold">{t('reports.running')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.period}
                className={`border-b border-line/60 ${row.short ? 'bg-danger-soft/50' : ''}`}
              >
                <td className="py-2">
                  <span className="tabular-nums">{row.label}</span>
                  {row.short ? (
                    <span className="ms-2 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">
                      {t('reports.short')}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 text-end tabular-nums text-primary-ink">
                  {money(locale, row.inflow, currency)}
                </td>
                <td className="py-2 text-end tabular-nums text-danger">
                  {money(locale, row.outflow, currency)}
                </td>
                <td
                  className={`py-2 text-end font-bold tabular-nums ${row.short ? 'text-danger' : 'text-ink'}`}
                >
                  {money(locale, row.net, currency)}
                </td>
                <td
                  className={`py-2 text-end tabular-nums ${isNegativeMoney(row.running) ? 'text-danger' : 'text-ink-soft'}`}
                >
                  {money(locale, row.running, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportLink({
  href,
  Icon,
  title,
  note,
  tone = 'neutral',
}: {
  href: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  note: string;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-line/90 bg-surface p-4 transition hover:border-line-strong hover:bg-subtle/40"
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary-ink'
        }`}
      >
        <Icon width="20" height="20" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink">{title}</span>
        <span
          className={`mt-0.5 block truncate text-xs ${tone === 'danger' ? 'text-danger' : 'text-ink-muted'}`}
        >
          {note}
        </span>
      </span>
    </Link>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="bg-surface px-4 py-3 text-center">
      <p className="text-[11px] font-medium text-ink-muted">{label}</p>
      <p className={`mt-1 text-[15px] font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

const CALLOUT_TONES = {
  teal: 'bg-primary-soft text-primary-ink',
  red: 'bg-danger-soft text-danger',
} as const;

function Callout({
  Icon,
  tone,
  count,
  label,
  lines,
}: {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tone: keyof typeof CALLOUT_TONES;
  count: number;
  label: string;
  lines: string[];
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line/90 p-4">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${CALLOUT_TONES[tone]}`}
      >
        <Icon width="20" height="20" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-ink tabular-nums">{count}</p>
        <p className="text-sm text-ink-muted">{label}</p>
        {/* One line per currency. Never summed. */}
        {lines.length > 0 ? (
          <p className="mt-1 text-xs text-ink-muted tabular-nums">{lines.join(' · ')}</p>
        ) : null}
      </div>
    </div>
  );
}
