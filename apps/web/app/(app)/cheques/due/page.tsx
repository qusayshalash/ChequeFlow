'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Card, ErrorState, LoadingState, StatCard } from '@cheque-flow/ui';

import { ChequeTable } from '@/components/cheque-table';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { money } from '@/lib/format';

const WINDOWS = [0, 7, 30] as const;

export default function DueChequesPage() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const [withinDays, setWithinDays] = useState<number>(7);

  const query = useQuery({
    queryKey: ['reports', 'due', withinDays],
    queryFn: () => api.getDueReport({ withinDays }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t('nav.due')}</h1>

      <Card className="flex flex-wrap gap-3">
        {WINDOWS.map((days) => (
          <Button
            key={days}
            variant={withinDays === days ? 'primary' : 'secondary'}
            onClick={() => setWithinDays(days)}
          >
            {days === 0
              ? t('reports.dueToday')
              : days === 7
                ? t('reports.due7')
                : t('reports.due30')}
          </Button>
        ))}
      </Card>

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
              hint={money(locale, query.data.total, 'SAR')}
            />
            <StatCard
              label={t('reports.overdue')}
              value={String(query.data.overdueCount)}
              hint={money(locale, query.data.overdueTotal, 'SAR')}
              tone="danger"
            />
          </div>
          <ChequeTable cheques={query.data.cheques} />
        </>
      ) : null}
    </div>
  );
}
