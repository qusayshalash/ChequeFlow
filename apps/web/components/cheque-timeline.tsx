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
    <Card className="p-0">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-[15px] font-bold text-slate-900">{t('cheque.timeline')}</h2>
      </div>
      <ol className="relative m-5 flex flex-col gap-5 border-s border-slate-200 ps-6">
        {query.data.data.map((event) => (
          <li key={event.id} className="relative">
            <span
              aria-hidden="true"
              className="absolute -start-[31px] top-1 size-3 rounded-full border-2 border-white bg-teal-600 ring-2 ring-teal-100"
            />
            <p className="font-semibold text-slate-950">{t(`event.${event.eventType}`)}</p>
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
