'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { Permission, type BouncedReportView } from '@cheque-flow/shared-types';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@cheque-flow/ui';

import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { RequirePermission } from '@/components/session';
import { WhatsAppReminder } from '@/components/whatsapp-reminder';
import { formatDate, money } from '@/lib/format';
import { loadErrorRequestId, loadErrorTitle } from '@/lib/query-error';

/**
 * Bounced cheques still to be recovered.
 *
 * The cheques list already filters by "bounced", but that answers which
 * cheques bounced, not which debts are still open: a cheque replaced in full
 * is done with, one replaced by a cheque that bounced too is not, and a list
 * of statuses cannot tell them apart. Oldest first, because the age of a
 * bounced cheque is what decides who gets called today.
 */
export default function BouncedReportPage() {
  return (
    <RequirePermission permission={Permission.REPORT_VIEW}>
      <BouncedReportBody />
    </RequirePermission>
  );
}

/** Thirty days unrecovered is where a bounced cheque stops being routine. */
const LATE_DAYS = 30;

function BouncedReportBody() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const report = useQuery<BouncedReportView>({
    queryKey: ['reports', 'bounced'],
    queryFn: () => api.getBouncedReport(),
  });

  if (report.isPending) return <LoadingState label={t('common.loading')} />;
  if (report.isError || !report.data) {
    return (
      <ErrorState
        title={loadErrorTitle(t, report.error)}
        requestId={loadErrorRequestId(report.error)}
        onRetry={() => void report.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const { byCurrency, cheques } = report.data;

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-5">
      <PageHeader title={t('bounced.title')} subtitle={t('bounced.subtitle')} />

      {byCurrency.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {byCurrency.map((entry) => (
            <div key={entry.currency} className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs text-ink-muted">
                {t('bounced.remaining')} · {entry.currency}
              </p>
              <p className="mt-1 text-xl font-bold text-danger tabular-nums" dir="ltr">
                {money(locale, entry.remaining, entry.currency)}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {t('bounced.chequeCount', { count: entry.count })}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <Panel bodyClassName="">
        {cheques.length === 0 ? (
          <EmptyState title={t('bounced.empty')} />
        ) : (
          <ul className="divide-y divide-line/70">
            {cheques.map((cheque) => {
              const late = cheque.daysSince >= LATE_DAYS;
              const partly = cheque.covered !== '0.00';
              return (
                <li
                  key={cheque.id}
                  className="flex flex-wrap items-start gap-x-6 gap-y-2 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/cheques/${cheque.id}`}
                        className="font-semibold text-ink tabular-nums hover:text-primary-ink"
                        dir="ltr"
                      >
                        {cheque.chequeNumber}
                      </Link>
                      <StatusBadge status={cheque.status} label={t(`status.${cheque.status}`)} />
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">
                      {cheque.contactId ? (
                        <Link
                          href={`/contacts/${cheque.contactId}`}
                          className="hover:text-primary-ink"
                        >
                          {cheque.contactName}
                        </Link>
                      ) : (
                        (cheque.contactName ?? t('common.unknown'))
                      )}
                      {cheque.bankName ? ` · ${cheque.bankName}` : ''}
                    </p>
                    {cheque.direction === 'INCOMING' ? (
                      <div className="mt-1">
                        <WhatsAppReminder
                          compact
                          cheques={[cheque]}
                          phone={cheque.contactPhone}
                          contactName={cheque.contactName}
                        />
                      </div>
                    ) : null}
                    {cheque.bounceReason ? (
                      <p className="mt-0.5 text-xs text-ink-muted">{cheque.bounceReason}</p>
                    ) : null}
                    {cheque.replacements.length > 0 ? (
                      <p className="mt-1 text-xs text-ink-muted">
                        {t('bounced.replacements')}:{' '}
                        {cheque.replacements.map((entry, index) => (
                          <span key={entry.id}>
                            {index > 0 ? '، ' : ''}
                            <Link
                              href={`/cheques/${entry.id}`}
                              className="hover:text-primary-ink"
                              dir="ltr"
                            >
                              {entry.chequeNumber}
                            </Link>{' '}
                            ({t(`status.${entry.status}`)})
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-sm">
                    <p className={`font-bold tabular-nums ${late ? 'text-danger' : 'text-ink'}`}>
                      {cheque.daysSince === 0
                        ? t('bounced.today')
                        : t('bounced.daysSince', { count: cheque.daysSince })}
                    </p>
                    <p className="text-xs text-ink-muted tabular-nums">
                      {formatDate(locale, cheque.bouncedOn)}
                    </p>
                  </div>

                  <div className="text-end">
                    <p className="font-bold text-danger tabular-nums" dir="ltr">
                      {money(locale, cheque.remaining, cheque.currency)}
                    </p>
                    {partly ? (
                      <p className="text-xs text-ink-muted tabular-nums" dir="ltr">
                        {t('bounced.of')} {money(locale, cheque.amount, cheque.currency)}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
