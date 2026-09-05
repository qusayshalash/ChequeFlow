'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Permission, utcToday } from '@cheque-flow/shared-types';
import { EmptyState, ErrorState, LoadingState } from '@cheque-flow/ui';

import { IconAlert, IconCalendar, IconSafe } from '@/components/icons';
import { LineChart } from '@/components/line-chart';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { RequirePermission } from '@/components/session';
import { Tabs } from '@/components/tabs';
import { formatDate, formatDayMonth, money } from '@/lib/format';

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
  const { locale } = useApp();

  const today = utcToday();
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

    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

    return {
      labels: rows.map((entry) =>
        grain === 'month' ? entry.period.slice(0, 7) : formatDayMonth(locale, entry.period),
      ),
      series: [
        {
          label: t('reports.inflow'),
          values: inflow,
          color: '#0B7C6B',
          ...(futureFrom >= 0 ? { dashedFrom: futureFrom } : {}),
        },
        {
          label: t('reports.outflow'),
          values: outflow,
          color: '#C43D42',
          ...(futureFrom >= 0 ? { dashedFrom: futureFrom } : {}),
        },
      ],
      totals: { inflow: sum(inflow), outflow: sum(outflow), net: sum(inflow) - sum(outflow) },
      empty: sum(inflow) === 0 && sum(outflow) === 0,
    };
  }, [cashFlow.data, shown, grain, from, to, today, locale, t]);

  const custodyTotal = custody.data?.count ?? 0;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <PageHeader title={t('reports.title')} subtitle={t('pageDescription.reports')} />

      {/* Controls. The old page had none: the window, the grouping and the
          currency were all fixed in the source. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <Tabs
            tabs={RANGES.map((entry) => ({ key: entry.key, label: t(entry.labelKey) }))}
            active={rangeKey}
            onChange={setRangeKey}
          />
        </div>

        <label className="inline-flex h-11 w-40 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 hover:border-slate-300">
          <span className="text-xs font-medium text-slate-400">{t('reports.granularity')}</span>
          <select
            className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold text-slate-700 outline-none"
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
          <div className="inline-flex rounded-xl bg-slate-100/80 p-1" role="group">
            {currencies.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setCurrency(code)}
                aria-pressed={code === shown}
                className={`h-9 rounded-lg px-4 text-sm font-semibold transition-colors ${
                  code === shown
                    ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-slate-400">
        {formatDate(locale, from)} — {formatDate(locale, to)} · {t('reports.perCurrencyNote')}
      </p>

      {/* ── Cash flow ─────────────────────────────────────────────────── */}
      <Panel title={`${t('reports.cashFlowTitle')}${shown ? ` — ${shown}` : ''}`}>
        <p className="-mt-1 mb-3 text-sm text-slate-500">{t('reports.cashFlowHint')}</p>

        {cashFlow.isPending ? <LoadingState label={t('common.loading')} /> : null}
        {cashFlow.isError ? (
          <ErrorState
            title={t('errors.loadFailed')}
            onRetry={() => void cashFlow.refetch()}
            retryLabel={t('common.retry')}
          />
        ) : null}

        {!cashFlow.isPending && !chart ? <EmptyState title={t('reports.empty')} /> : null}

        {chart ? (
          <>
            {chart.empty ? (
              <p className="mb-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                {t('reports.noCurrencyData')}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
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

            <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-slate-200/70 sm:grid-cols-3">
              <Figure
                label={t('reports.inflow')}
                value={money(locale, chart.totals.inflow.toFixed(2), shown!)}
                tone="text-teal-700"
              />
              <Figure
                label={t('reports.outflow')}
                value={money(locale, chart.totals.outflow.toFixed(2), shown!)}
                tone="text-red-600"
              />
              <Figure
                label={t('reports.net')}
                value={money(locale, chart.totals.net.toFixed(2), shown!)}
                tone={chart.totals.net < 0 ? 'text-red-600' : 'text-teal-700'}
              />
            </div>
          </>
        ) : null}
      </Panel>

      {/* ── Due in the window ─────────────────────────────────────────── */}
      <Panel title={t('reports.dueTitle')}>
        <p className="-mt-1 mb-3 text-sm text-slate-500">{t('reports.dueHint')}</p>

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
        <p className="-mt-1 mb-3 text-sm text-slate-500">{t('reports.custodyHint')}</p>

        {custody.isPending ? <LoadingState label={t('common.loading')} /> : null}
        {custody.isError ? (
          <ErrorState
            title={t('errors.loadFailed')}
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
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <IconSafe width="16" height="16" className="text-slate-400" />
                    {entry.locationName ?? entry.holderName ?? t('common.unknown')}
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {entry.count} · {Math.round(share * 100)}% {t('reports.ofTotal')}
                  </span>
                </div>

                {/* A bar, not just a number. "Twenty in the safe" means little
                    until you can see it is most of them. */}
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-600"
                    style={{ width: `${Math.max(share * 100, 2)}%` }}
                  />
                </div>

                <p className="text-xs text-slate-500 tabular-nums">
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
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="bg-white px-4 py-3 text-center">
      <p className="text-[11px] font-medium text-slate-400">{label}</p>
      <p className={`mt-1 text-[15px] font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

const CALLOUT_TONES = {
  teal: 'bg-teal-50 text-teal-700',
  red: 'bg-red-50 text-red-600',
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
    <div className="flex items-start gap-3 rounded-xl border border-slate-200/90 p-4">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${CALLOUT_TONES[tone]}`}
      >
        <Icon width="20" height="20" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{count}</p>
        <p className="text-sm text-slate-500">{label}</p>
        {/* One line per currency. Never summed. */}
        {lines.length > 0 ? (
          <p className="mt-1 text-xs text-slate-500 tabular-nums">{lines.join(' · ')}</p>
        ) : null}
      </div>
    </div>
  );
}
