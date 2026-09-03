'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

import type { ReminderRow } from '@cheque-flow/api-client';
import { Badge, Button, EmptyState, ErrorState, LoadingState, StatCard } from '@cheque-flow/ui';

import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { formatDate, formatDateTime, money } from '@/lib/format';

/** Snooze options, in minutes. */
const SNOOZE = [
  { labelKey: 'reminders.snoozeHour', minutes: 60 },
  { labelKey: 'reminders.snoozeDay', minutes: 60 * 24 },
  { labelKey: 'reminders.snoozeWeek', minutes: 60 * 24 * 7 },
];

export default function NotificationsPage() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.listNotifications(100),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  const snooze = useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      api.snoozeReminder(id, minutes),
    onSuccess: invalidate,
  });

  const acknowledge = useMutation({
    mutationFn: (id: string) => api.acknowledgeReminder(id),
    onSuccess: invalidate,
  });

  const rows = query.data?.data ?? [];
  // Due first: those are the ones that need acting on today. The API already
  // sorts this way; the split is so each group can carry its own heading.
  const due = rows.filter((row) => row.isDue);
  const upcoming = rows.filter((row) => !row.isDue);

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      <PageHeader title={t('nav.notifications')} subtitle={t('pageDescription.notifications')} />

      {!query.isPending && rows.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label={t('reminders.due')} value={String(due.length)} tone="warning" />
          <StatCard label={t('reminders.upcoming')} value={String(upcoming.length)} />
        </div>
      ) : null}

      {query.isError ? (
        <ErrorState
          title={t('errors.loadFailed')}
          onRetry={() => void query.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}

      {query.isPending ? <LoadingState label={t('common.loading')} /> : null}

      {!query.isPending && rows.length === 0 ? (
        <Panel>
          <EmptyState title={t('reminders.empty')} />
        </Panel>
      ) : null}

      {due.length > 0 ? (
        <Panel title={t('reminders.due')}>
          <ul className="flex flex-col gap-3">
            {due.map((row) => (
              <ReminderCard
                key={row.id}
                row={row}
                due
                onSnooze={(minutes) => snooze.mutate({ id: row.id, minutes })}
                onAcknowledge={() => acknowledge.mutate(row.id)}
                t={t}
                money={(amount, currency) => money(locale, amount, currency)}
                date={(iso) => formatDate(locale, iso)}
                dateTime={(iso) => formatDateTime(locale, iso)}
              />
            ))}
          </ul>
        </Panel>
      ) : null}

      {upcoming.length > 0 ? (
        <Panel title={t('reminders.upcoming')}>
          <ul className="flex flex-col gap-3">
            {upcoming.map((row) => (
              <ReminderCard
                key={row.id}
                row={row}
                onSnooze={(minutes) => snooze.mutate({ id: row.id, minutes })}
                onAcknowledge={() => acknowledge.mutate(row.id)}
                t={t}
                money={(amount, currency) => money(locale, amount, currency)}
                date={(iso) => formatDate(locale, iso)}
                dateTime={(iso) => formatDateTime(locale, iso)}
              />
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function ReminderCard({
  row,
  due = false,
  onSnooze,
  onAcknowledge,
  t,
  money: formatAmount,
  date,
  dateTime,
}: {
  row: ReminderRow;
  due?: boolean;
  onSnooze: (minutes: number) => void;
  onAcknowledge: () => void;
  t: (key: string) => string;
  money: (amount: string, currency: string) => string;
  date: (iso: string) => string;
  dateTime: (iso: string) => string;
}) {
  return (
    <li
      className={`rounded-xl border p-4 transition-colors hover:border-slate-300 ${due ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/cheques/${row.cheque.id}`}
              className="font-mono font-semibold text-slate-900 hover:text-teal-700"
              dir="ltr"
            >
              {row.cheque.chequeNumber}
            </Link>
            {row.custom ? <Badge>{t('reminders.custom')}</Badge> : null}
          </div>

          <p className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">
            {formatAmount(row.cheque.amount, row.cheque.currency)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {t('cheque.dueDate')}: {date(row.cheque.dueDate)} · {dateTime(row.remindAt)}
          </p>
          {row.note ? <p className="mt-1 text-sm text-slate-700">{row.note}</p> : null}
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <details className="group relative">
            <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
              {t('reminders.snooze')}
            </summary>
            <div className="absolute end-0 z-20 mt-2 flex w-36 flex-col rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {SNOOZE.map((option) => (
                <button
                  key={option.minutes}
                  type="button"
                  onClick={() => onSnooze(option.minutes)}
                  className="min-h-9 rounded-lg px-3 text-start text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
          </details>
          <Button variant="secondary" onClick={onAcknowledge}>
            {t('reminders.acknowledge')}
          </Button>
        </div>
      </div>
    </li>
  );
}
