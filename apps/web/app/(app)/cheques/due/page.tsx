'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ErrorState, LoadingState, StatCard } from '@cheque-flow/ui';

import { ChequeTable } from '@/components/cheque-table';
import {
  DateRangePicker,
  EMPTY_RANGE,
  isRangeInvalid,
  type DateRange,
} from '@/components/date-range';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { money } from '@/lib/format';

export default function DueChequesPage() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const [range, setRange] = useState<DateRange>(EMPTY_RANGE);

  // A backwards range would produce an empty report that reads as "nothing is
  // due", which is the opposite of useful on this page.
  const applied = isRangeInvalid(range) ? EMPTY_RANGE : range;

  const query = useQuery({
    queryKey: ['reports', 'due', applied],
    queryFn: () =>
      api.getDueReport({
        ...(applied.from ? { from: applied.from } : {}),
        ...(applied.to ? { to: applied.to } : {}),
        // Without an explicit window the API falls back to the next seven days
        // and folds in everything overdue, which is what a chasing list wants.
        // Once dates are chosen the answer must be exactly those dates.
        ...(applied.from || applied.to ? { includeOverdue: false } : { withinDays: 7 }),
      }),
  });

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader title={t('nav.due')} subtitle={t('pageDescription.due')} />

      <DateRangePicker value={range} onChange={setRange} />

      {query.isPending ? <LoadingState label={t('common.loading')} /> : null}
      {query.isError ? (
        <ErrorState
          title={t('errors.INTERNAL_ERROR')}
          onRetry={() => void query.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}

      {query.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label={t('common.count')}
              value={String(query.data.count)}
              // One line per currency. This used to render the sum of every
              // currency and label it SAR, which looked correct and was not.
              hint={query.data.byCurrency
                .map((entry) => money(locale, entry.total, entry.currency))
                .join(' · ')}
            />
            <StatCard
              label={t('reports.overdue')}
              value={String(query.data.overdueCount)}
              hint={query.data.overdueByCurrency
                .map((entry) => money(locale, entry.total, entry.currency))
                .join(' · ')}
              tone="danger"
            />
          </div>
          <Panel bodyClassName="">
            <ChequeTable cheques={query.data.cheques} emptyDescription={t('reports.empty')} />
          </Panel>
        </>
      ) : null}
    </div>
  );
}
