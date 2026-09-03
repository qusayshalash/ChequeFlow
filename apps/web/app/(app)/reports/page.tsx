'use client';

import { useQuery } from '@tanstack/react-query';

import { Permission } from '@cheque-flow/shared-types';
import { EmptyState, ErrorState, LoadingState, StatCard } from '@cheque-flow/ui';

import { DataTable } from '@/components/data-table';
import { ExportButton } from '@/components/export-button';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { RequirePermission } from '@/components/session';
import { money } from '@/lib/format';

function isoDate(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
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

  const custody = useQuery({
    queryKey: ['reports', 'custody'],
    queryFn: () => api.getCustodyReport(),
  });
  const cashFlow = useQuery({
    queryKey: ['reports', 'cash-flow'],
    queryFn: () =>
      api.getCashFlowReport({ from: isoDate(0), to: isoDate(90), granularity: 'week' }),
  });

  const custodyRows =
    custody.data?.entries.map((entry, index) => ({ ...entry, key: String(index) })) ?? [];
  const cashFlowRows =
    cashFlow.data?.periods.flatMap((period) =>
      period.byCurrency.map((entry) => ({ ...entry, period: period.period })),
    ) ?? [];

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader
        title={t('reports.title')}
        subtitle={t('pageDescription.reports')}
        actions={<ExportButton />}
      />

      <section className="flex flex-col gap-4" aria-labelledby="custody-heading">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">
            {t('reports.title')}
          </p>
          <h2 id="custody-heading" className="mt-1 text-lg font-bold text-slate-950">
            {t('reports.custody')}
          </h2>
        </div>
        {custody.isPending ? <LoadingState label={t('common.loading')} /> : null}
        {custody.isError ? (
          <ErrorState
            title={t('errors.INTERNAL_ERROR')}
            onRetry={() => void custody.refetch()}
            retryLabel={t('common.retry')}
          />
        ) : null}
        {custody.data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label={t('common.count')} value={String(custody.data.count)} />
              <StatCard
                label={t('common.total')}
                // Per currency: the sum of shekels and dollars is not a total.
                value={
                  custody.data.byCurrency
                    .map((entry) => money(locale, entry.total, entry.currency))
                    .join(' · ') || '—'
                }
              />
            </div>
            <Panel bodyClassName="">
              <DataTable
                rows={custodyRows}
                rowKey={(entry) => entry.key}
                empty={<EmptyState title={t('reports.empty')} />}
                columns={[
                  {
                    key: 'location',
                    header: t('cheque.currentLocation'),
                    cell: (entry) => (
                      <span className="font-semibold text-slate-900">
                        {entry.locationName ?? t('common.unknown')}
                      </span>
                    ),
                  },
                  {
                    key: 'holder',
                    header: t('cheque.currentHolder'),
                    cell: (entry) => entry.holderName ?? t('common.unknown'),
                  },
                  {
                    key: 'count',
                    header: t('common.count'),
                    numeric: true,
                    cell: (entry) => entry.count,
                  },
                  {
                    key: 'total',
                    header: t('common.total'),
                    numeric: true,
                    cell: (entry) => (
                      <span className="font-semibold text-slate-900">
                        {entry.byCurrency
                          .map((bucket) => money(locale, bucket.total, bucket.currency))
                          .join(' · ')}
                      </span>
                    ),
                  },
                ]}
              />
            </Panel>
          </>
        ) : null}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="cash-flow-heading">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">
            {t('reports.title')}
          </p>
          <h2 id="cash-flow-heading" className="mt-1 text-lg font-bold text-slate-950">
            {t('reports.cashFlow')}
          </h2>
        </div>
        {cashFlow.isPending ? <LoadingState label={t('common.loading')} /> : null}
        {cashFlow.isError ? (
          <ErrorState
            title={t('errors.INTERNAL_ERROR')}
            onRetry={() => void cashFlow.refetch()}
            retryLabel={t('common.retry')}
          />
        ) : null}
        {cashFlow.data ? (
          <Panel bodyClassName="">
            <DataTable
              rows={cashFlowRows}
              rowKey={(entry) => `${entry.period}-${entry.currency}`}
              empty={<EmptyState title={t('reports.empty')} />}
              columns={[
                {
                  key: 'date',
                  header: t('common.date'),
                  cell: (entry) => (
                    <span className="font-mono text-xs font-semibold text-slate-900" dir="ltr">
                      {entry.period} · {entry.currency}
                    </span>
                  ),
                },
                {
                  key: 'inflow',
                  header: t('reports.expectedInflow'),
                  numeric: true,
                  cell: (entry) => money(locale, entry.inflow, entry.currency),
                },
                {
                  key: 'outflow',
                  header: t('reports.expectedOutflow'),
                  numeric: true,
                  cell: (entry) => money(locale, entry.outflow, entry.currency),
                },
                {
                  key: 'net',
                  header: t('reports.net'),
                  numeric: true,
                  cell: (entry) => (
                    <span
                      className={`font-bold ${Number(entry.net) < 0 ? 'text-red-700' : 'text-teal-700'}`}
                    >
                      {money(locale, entry.net, entry.currency)}
                    </span>
                  ),
                },
              ]}
            />
          </Panel>
        ) : null}
      </section>
    </div>
  );
}
