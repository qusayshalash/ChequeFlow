'use client';

import { useQuery } from '@tanstack/react-query';

import { Card, ErrorState, LoadingState, StatCard } from '@cheque-flow/ui';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { money } from '@/lib/format';

function isoDate(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export default function ReportsPage() {
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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t('reports.title')}</h1>

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
                <thead className="text-slate-700">
                  <tr>
                    <th scope="col" className="p-2 text-start font-medium">
                      {t('cheque.currentLocation')}
                    </th>
                    <th scope="col" className="p-2 text-start font-medium">
                      {t('cheque.currentHolder')}
                    </th>
                    <th scope="col" className="p-2 text-start font-medium">
                      {t('common.count')}
                    </th>
                    <th scope="col" className="p-2 text-start font-medium">
                      {t('common.total')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {custody.data.entries.map((entry, index) => (
                    <tr key={`${entry.locationName ?? ''}-${entry.holderName ?? ''}-${index}`}>
                      <td className="p-2">{entry.locationName ?? t('common.unknown')}</td>
                      <td className="p-2">{entry.holderName ?? t('common.unknown')}</td>
                      <td className="p-2 tabular-nums">{entry.count}</td>
                      <td className="p-2 tabular-nums">
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
              <thead className="text-slate-700">
                <tr>
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('common.date')}
                  </th>
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('reports.expectedInflow')}
                  </th>
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('reports.expectedOutflow')}
                  </th>
                  <th scope="col" className="p-2 text-start font-medium">
                    {t('reports.net')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashFlow.data.periods.flatMap((period) =>
                  period.byCurrency.map((entry) => (
                    <tr key={`${period.period}-${entry.currency}`}>
                      <td className="p-2 tabular-nums" dir="ltr">
                        {period.period} · {entry.currency}
                      </td>
                      <td className="p-2 tabular-nums">
                        {money(locale, entry.inflow, entry.currency)}
                      </td>
                      <td className="p-2 tabular-nums">
                        {money(locale, entry.outflow, entry.currency)}
                      </td>
                      <td className="p-2 tabular-nums">
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
