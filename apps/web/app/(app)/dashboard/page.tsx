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

      {data.currencies.length === 0 ? (
        <EmptyState title={t('dashboard.noData')} />
      ) : (
        data.currencies.map((totals) => (
          <section key={totals.currency} className="flex flex-col gap-3">
            {/* One block per currency: shekels and dollars are never added
                together, so each gets its own labelled set of figures. */}
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{totals.currency}</h2>
              {data.currencies.length > 1 ? (
                <span className="text-xs text-slate-500">{t('dashboard.currencyNote')}</span>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t('dashboard.draft')}
                value={String(totals.draft.count)}
                hint={money(locale, totals.draft.total, totals.currency)}
              />
              <StatCard
                label={t('dashboard.inHandCount')}
                value={String(totals.inHand.count)}
                hint={money(locale, totals.inHand.total, totals.currency)}
                tone="info"
              />
              <StatCard
                label={t('dashboard.dueToday')}
                value={String(totals.dueToday.count)}
                hint={money(locale, totals.dueToday.total, totals.currency)}
                tone="warning"
              />
              <StatCard
                label={t('dashboard.dueWithin7Days')}
                value={String(totals.dueWithin7Days.count)}
                hint={money(locale, totals.dueWithin7Days.total, totals.currency)}
              />
              <StatCard
                label={t('dashboard.dueWithin30Days')}
                value={String(totals.dueWithin30Days.count)}
                hint={money(locale, totals.dueWithin30Days.total, totals.currency)}
              />
              <StatCard
                label={t('dashboard.overdue')}
                value={String(totals.overdue.count)}
                hint={money(locale, totals.overdue.total, totals.currency)}
                tone="danger"
              />
              <StatCard
                label={t('dashboard.deposited')}
                value={String(totals.deposited.count)}
                hint={money(locale, totals.deposited.total, totals.currency)}
                tone="info"
              />
              <StatCard
                label={t('dashboard.cleared')}
                value={String(totals.cleared.count)}
                hint={money(locale, totals.cleared.total, totals.currency)}
                tone="success"
              />
              <StatCard
                label={t('dashboard.returned')}
                value={String(totals.returned.count)}
                hint={money(locale, totals.returned.total, totals.currency)}
                tone="warning"
              />
              <StatCard
                label={t('dashboard.bounced')}
                value={String(totals.bounced.count)}
                hint={money(locale, totals.bounced.total, totals.currency)}
                tone="danger"
              />
              <StatCard
                label={`${t('dashboard.incoming')} / ${t('dashboard.outgoing')}`}
                value={`${totals.incoming.count} / ${totals.outgoing.count}`}
                hint={`${money(locale, totals.incoming.total, totals.currency)} / ${money(
                  locale,
                  totals.outgoing.total,
                  totals.currency,
                )}`}
              />
            </div>
          </section>
        ))
      )}

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
                <Link
                  href={`/cheques/${event.chequeId}`}
                  className="font-mono text-sm text-sky-700 underline-offset-2 hover:underline"
                >
                  {event.chequeNumber}
                </Link>
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
