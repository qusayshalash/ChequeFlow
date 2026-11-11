'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';

import { ApiClientError } from '@cheque-flow/api-client';
import type { PublicStatementView } from '@cheque-flow/shared-types';
import { Button, LoadingState } from '@cheque-flow/ui';

import { IconLogo } from '@/components/icons';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { formatDate, formatDateTime, money } from '@/lib/format';

/**
 * A contact's own statement, opened from a share link, without an account.
 *
 * Written from the contact's side, not ours: a balance they owe reads "owed
 * by you", and a cheque is described by its part in their account (given by
 * you, or handed to you) rather than by who else held it, which is not theirs
 * to see. The server sends nothing more than this page shows.
 */
export default function SharedStatementPage() {
  const { token } = useParams<{ token: string }>();
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();

  const statement = useQuery<PublicStatementView>({
    queryKey: ['shared-statement', token],
    queryFn: () => api.getPublicStatement(token),
    retry: false,
  });

  if (statement.isPending) return <LoadingState label={t('common.loading')} />;

  if (statement.isError || !statement.data) {
    const gone = statement.error instanceof ApiClientError && statement.error.code === 'NOT_FOUND';
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] p-6">
        <div className="max-w-md rounded-3xl border border-line bg-surface p-8 text-center">
          <h1 className="text-xl font-bold text-ink">{t('sharedStatement.unavailableTitle')}</h1>
          <p className="mt-3 text-sm leading-7 text-ink-muted">
            {gone ? t('sharedStatement.unavailable') : t('errors.INTERNAL_ERROR')}
          </p>
        </div>
      </main>
    );
  }

  const data = statement.data;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-4 py-8 sm:px-8">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, main { background: #fff !important; }
          .sheet { border: 0 !important; padding: 0 !important; }
          .row { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="mx-auto max-w-[960px]">
        <div className="no-print mb-4 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-bold text-ink">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
              <IconLogo width="18" height="18" />
            </span>
            {data.organizationName}
          </span>
          <Button variant="secondary" onClick={() => window.print()}>
            {t('contact.printStatement')}
          </Button>
        </div>

        <article className="sheet rounded-3xl border border-line bg-surface p-5 text-ink sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <p className="text-sm text-ink-muted">{data.organizationName}</p>
              <h1 className="mt-1 text-2xl font-bold">{t('contact.statement')}</h1>
              <p className="mt-1 text-lg font-semibold">{data.contactName}</p>
            </div>
            <div className="text-sm text-ink-muted">
              <p>
                {t('contact.issuedOn')}:{' '}
                <span className="tabular-nums">{formatDate(locale, data.issuedOn)}</span>
              </p>
              <p className="mt-1">
                {t('sharedStatement.validUntil')}:{' '}
                <span className="tabular-nums">{formatDateTime(locale, data.expiresAt)}</span>
              </p>
            </div>
          </header>

          <section className="mt-5 grid gap-3 sm:grid-cols-2">
            {data.currencies.map((entry) => {
              const settled = Number(entry.net) === 0;
              const theyOwe = !entry.net.startsWith('-');
              return (
                <div key={entry.currency} className="row rounded-2xl border border-line p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-bold">{entry.currency}</p>
                    <p className="text-xs text-ink-muted">
                      {settled
                        ? t('contact.settled')
                        : theyOwe
                          ? t('sharedStatement.owedByYou')
                          : t('sharedStatement.owedToYou')}
                    </p>
                  </div>
                  <p dir="ltr" className="mt-1 text-end text-2xl font-bold tabular-nums">
                    {money(locale, entry.net.replace(/^-/, ''), entry.currency)}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {(
                      [
                        ['contact.pending', entry.pending],
                        ['contact.collected', entry.collected],
                        ['contact.bounced', entry.bounced],
                        ['contact.returned', entry.returned],
                      ] as const
                    ).map(([labelKey, bucket]) => (
                      <div key={labelKey} className="flex justify-between gap-2">
                        <dt className="text-ink-muted">
                          {t(labelKey)} ({bucket.count})
                        </dt>
                        <dd className="tabular-nums">
                          {money(locale, bucket.total, entry.currency)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </section>

          <section className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-line text-xs text-ink-muted">
                  <th className="px-2 py-2 text-start font-semibold">{t('cheque.number')}</th>
                  <th className="px-2 py-2 text-start font-semibold">
                    {t('sharedStatement.part')}
                  </th>
                  <th className="px-2 py-2 text-start font-semibold">{t('cheque.drawnOnBank')}</th>
                  <th className="px-2 py-2 text-start font-semibold">{t('cheque.dueDate')}</th>
                  <th className="px-2 py-2 text-start font-semibold">{t('cheque.status')}</th>
                  <th className="px-2 py-2 text-end font-semibold">{t('common.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {data.cheques.map((cheque) => (
                  <tr
                    key={`${cheque.chequeNumber}-${cheque.dueDate}`}
                    className="row border-b border-line/70"
                  >
                    <td className="px-2 py-2 tabular-nums" dir="ltr">
                      {cheque.chequeNumber}
                    </td>
                    <td className="px-2 py-2">
                      {cheque.part === 'FROM_THEM'
                        ? t('sharedStatement.fromYou')
                        : t('sharedStatement.toYou')}
                    </td>
                    <td className="px-2 py-2">{cheque.bankName ?? '—'}</td>
                    <td className="px-2 py-2 tabular-nums">{formatDate(locale, cheque.dueDate)}</td>
                    <td className="px-2 py-2">{t(`status.${cheque.status}`)}</td>
                    <td className="px-2 py-2 text-end font-semibold tabular-nums">
                      {money(locale, cheque.amount, cheque.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </article>
      </div>
    </main>
  );
}
