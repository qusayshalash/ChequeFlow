'use client';

import { useQuery } from '@tanstack/react-query';

import { Card, ErrorState, LoadingState, StatCard } from '@cheque-flow/ui';

import { ExportButton } from '@/components/export-button';
import { Permission } from '@cheque-flow/shared-types';

import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/session';
import { useApi, useApp, useTranslator } from '@/components/providers';
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

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <PageHeader title={t('reports.title')} actions={<ExportButton />} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('reports.custody')}</h2>
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
            <Card>
              <table className="w-full text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th scope="col" className="p-3 text-start text-xs font-medium">
                      {t('cheque.currentLocation')}
                    </th>
                    <th scope="col" className="p-3 text-start text-xs font-medium">
                      {t('cheque.currentHolder')}
                    </th>
                    <th scope="col" className="p-3 text-start text-xs font-medium">
                      {t('common.count')}
                    </th>
                    <th scope="col" className="p-3 text-start text-xs font-medium">
                      {t('common.total')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {custody.data.entries.map((entry, index) => (
                    <tr key={`${entry.locationName ?? ''}-${entry.holderName ?? ''}-${index}`}>
                      <td className="p-3 text-slate-700">
                        {entry.locationName ?? t('common.unknown')}
                      </td>
                      <td className="p-3 text-slate-700">
                        {entry.holderName ?? t('common.unknown')}
                      </td>
                      <td className="p-3 tabular-nums text-slate-700">{entry.count}</td>
                      <td className="p-3 tabular-nums text-slate-700">
                        {entry.byCurrency
                          .map((bucket) => money(locale, bucket.total, bucket.currency))
                          .join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('reports.cashFlow')}</h2>
        {cashFlow.isPending ? <LoadingState label={t('common.loading')} /> : null}
        {cashFlow.data ? (
          <Card>
            <table className="w-full text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th scope="col" className="p-3 text-start text-xs font-medium">
                    {t('common.date')}
                  </th>
                  <th scope="col" className="p-3 text-start text-xs font-medium">
                    {t('reports.expectedInflow')}
                  </th>
                  <th scope="col" className="p-3 text-start text-xs font-medium">
                    {t('reports.expectedOutflow')}
                  </th>
                  <th scope="col" className="p-3 text-start text-xs font-medium">
                    {t('reports.net')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashFlow.data.periods.flatMap((period) =>
                  period.byCurrency.map((entry) => (
                    <tr key={`${period.period}-${entry.currency}`}>
                      <td className="p-3 tabular-nums text-slate-700" dir="ltr">
                        {period.period} · {entry.currency}
                      </td>
                      <td className="p-3 tabular-nums text-slate-700">
                        {money(locale, entry.inflow, entry.currency)}
                      </td>
                      <td className="p-3 tabular-nums text-slate-700">
                        {money(locale, entry.outflow, entry.currency)}
                      </td>
                      <td className="p-3 tabular-nums text-slate-700">
                        {money(locale, entry.net, entry.currency)}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
