'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import type { ContactStatementView } from '@cheque-flow/shared-types';
import { Button, ErrorState, LoadingState } from '@cheque-flow/ui';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { formatDate, money } from '@/lib/format';
import { loadErrorRequestId, loadErrorTitle } from '@/lib/query-error';
import { useToday } from '@/lib/today';

/**
 * A contact's statement, on paper.
 *
 * Made to leave the system: printed, or saved as a PDF from the print dialog
 * and sent to the contact. The browser lays the Arabic out, so the PDF reads
 * as the screen does; a PDF drawn on the server would need its own Arabic
 * shaping and fonts to get there. Every cheque is listed, not the latest
 * fifty the screen shows: a statement handed to someone is the whole account.
 */
export default function ContactStatementPrintPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const today = useToday();

  const statement = useQuery<ContactStatementView>({
    queryKey: ['contact-statement', id, 'full'],
    queryFn: () => api.getContactStatement(id, { full: true }),
  });

  if (statement.isPending) return <LoadingState label={t('common.loading')} />;
  if (statement.isError || !statement.data) {
    return (
      <ErrorState
        title={loadErrorTitle(t, statement.error)}
        requestId={loadErrorRequestId(statement.error)}
        onRetry={() => void statement.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const { contact, currencies, cheques } = statement.data;

  return (
    <div className="mx-auto max-w-[1000px]">
      <style>{`
        @media print {
          .no-print, nav, aside, header { display: none !important; }
          body, main { background: #fff !important; }
          .statement-sheet { border: 0 !important; box-shadow: none !important; padding: 0 !important; }
          .statement-row { break-inside: avoid; page-break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/contacts/${id}`} className="text-sm font-semibold text-primary-ink">
          ← {contact.name}
        </Link>
        <Button onClick={() => window.print()}>{t('contact.printStatement')}</Button>
      </div>
      <p className="no-print mb-4 text-xs text-ink-muted">{t('contact.printStatementHint')}</p>

      <article className="statement-sheet rounded-2xl border border-line bg-surface p-6 text-ink">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <h1 className="text-2xl font-bold">{t('contact.statement')}</h1>
            <p className="mt-1 text-lg font-semibold">{contact.name}</p>
            {contact.companyName ? (
              <p className="text-sm text-ink-muted">{contact.companyName}</p>
            ) : null}
            {contact.phone ? (
              <p className="text-sm text-ink-muted" dir="ltr">
                {contact.phone}
              </p>
            ) : null}
          </div>
          <div className="text-sm text-ink-muted">
            <p>
              {t('contact.issuedOn')}:{' '}
              <span className="tabular-nums">{formatDate(locale, today)}</span>
            </p>
            <p>
              {t('contact.chequeCount')}: <span className="tabular-nums">{cheques.length}</span>
            </p>
          </div>
        </header>

        {/* The balance per currency, leading: it is what the reader came for. */}
        <section className="mt-5 grid gap-3 sm:grid-cols-2">
          {currencies.map((entry) => {
            const settled = Number(entry.net) === 0;
            const owed = !entry.net.startsWith('-');
            return (
              <div key={entry.currency} className="statement-row rounded-xl border border-line p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-bold">{entry.currency}</p>
                  <p className="text-xs text-ink-muted">
                    {settled
                      ? t('contact.settled')
                      : owed
                        ? t('contact.owesUs')
                        : t('contact.weOwe')}
                  </p>
                </div>
                <p dir="ltr" className="mt-1 text-end text-xl font-bold tabular-nums">
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

        <section className="mt-6">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-line text-xs text-ink-muted">
                <th className="px-2 py-2 text-start font-semibold">{t('cheque.number')}</th>
                <th className="px-2 py-2 text-start font-semibold">{t('contact.from')}</th>
                <th className="px-2 py-2 text-start font-semibold">{t('contact.to')}</th>
                <th className="px-2 py-2 text-start font-semibold">{t('cheque.drawnOnBank')}</th>
                <th className="px-2 py-2 text-start font-semibold">{t('cheque.dueDate')}</th>
                <th className="px-2 py-2 text-start font-semibold">{t('cheque.status')}</th>
                <th className="px-2 py-2 text-end font-semibold">{t('common.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {cheques.map((cheque) => (
                <tr key={cheque.id} className="statement-row border-b border-line/70">
                  <td className="px-2 py-2 tabular-nums" dir="ltr">
                    {cheque.chequeNumber}
                  </td>
                  <td className="px-2 py-2">{cheque.originalSourceName ?? '—'}</td>
                  <td className="px-2 py-2">{cheque.currentRecipientName ?? '—'}</td>
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
  );
}
