'use client';

import { useQuery } from '@tanstack/react-query';

import type { ChequeEventView } from '@cheque-flow/shared-types';
import { Card, EmptyState, LoadingState } from '@cheque-flow/ui';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { formatDateTime } from '@/lib/format';

/** The cheque ledger. Events are append-only, so this view is read-only. */
export function ChequeTimeline({ chequeId }: { chequeId: string }) {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();

  const query = useQuery<{ data: ChequeEventView[] }>({
    queryKey: ['cheque-events', chequeId],
    queryFn: () => api.listChequeEvents(chequeId),
  });

  if (query.isPending) return <LoadingState label={t('common.loading')} />;
  if (!query.data || query.data.data.length === 0) {
    return <EmptyState title={t('dashboard.emptyActivity')} />;
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('cheque.timeline')}</h2>
      <ol className="relative flex flex-col gap-4 border-s-2 border-slate-200 ps-5">
        {query.data.data.map((event) => (
          <li key={event.id} className="relative">
            <span
              aria-hidden="true"
              className="absolute -start-[27px] top-1.5 size-3 rounded-full bg-teal-700"
            />
            <p className="font-medium text-slate-900">{t(`event.${event.eventType}`)}</p>
            <p className="text-sm text-slate-600">
              {event.fromStatus ? `${t(`status.${event.fromStatus}`)} ← ` : ''}
              {event.toStatus ? t(`status.${event.toStatus}`) : ''}
            </p>
            {event.fromContactName || event.toContactName ? (
              <p className="text-sm text-slate-600">
                {event.fromContactName
                  ? `${t('cheque.originalSource')}: ${event.fromContactName}`
                  : ''}
                {event.toContactName
                  ? ` ${t('cheque.currentRecipient')}: ${event.toContactName}`
                  : ''}
              </p>
            ) : null}
            {event.toLocationName ? (
              <p className="text-sm text-slate-600">
                {t('cheque.currentLocation')}: {event.toLocationName}
              </p>
            ) : null}
            {event.notes ? <p className="text-sm text-slate-700">{event.notes}</p> : null}
            <p className="text-xs text-slate-500">
              {formatDateTime(locale, event.createdAt)}
              {event.performedByName
                ? ` · ${t('event.performedBy')}: ${event.performedByName}`
                : ''}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
