'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import type { DashboardSummary } from '@cheque-flow/shared-types';
import { Button, Card, EmptyState, ErrorState, LoadingState, StatCard } from '@cheque-flow/ui';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { formatDateTime, money } from '@/lib/format';

export default function DashboardPage() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();

  const { data, isPending, isError, refetch } = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
  });

  if (isPending) return <LoadingState label={t('common.loading')} />;
  if (isError || !data) {
    return (
      <ErrorState
        title={t('errors.INTERNAL_ERROR')}
        onRetry={() => void refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{t('dashboard.title')}</h1>
        <Link href="/cheques/new">
          <Button size="lg">{t('cheque.newTitle')}</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('dashboard.inHandCount')}
          value={String(data.inHandCount)}
          hint={money(locale, data.inHandTotal, data.currency)}
          tone="info"
        />
        <StatCard
          label={t('dashboard.dueToday')}
          value={String(data.dueTodayCount)}
          hint={money(locale, data.dueTodayTotal, data.currency)}
          tone="warning"
        />
        <StatCard
          label={t('dashboard.dueWithin7Days')}
          value={String(data.dueWithin7DaysCount)}
          hint={money(locale, data.dueWithin7DaysTotal, data.currency)}
        />
        <StatCard
          label={t('dashboard.bounced')}
          value={String(data.bouncedCount)}
          hint={money(locale, data.bouncedTotal, data.currency)}
          tone="danger"
        />
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          {t('dashboard.recentActivity')}
        </h2>
        {data.recentEvents.length === 0 ? (
          <EmptyState title={t('dashboard.emptyActivity')} />
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {data.recentEvents.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-2 py-3">
                <span className="font-medium text-slate-900">{t(`event.${event.eventType}`)}</span>
                {event.toStatus ? (
                  <span className="text-sm text-slate-600">← {t(`status.${event.toStatus}`)}</span>
                ) : null}
                {event.performedByName ? (
                  <span className="text-sm text-slate-500">
                    {t('event.performedBy')}: {event.performedByName}
                  </span>
                ) : null}
                <span className="ms-auto text-xs text-slate-500">
                  {formatDateTime(locale, event.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
