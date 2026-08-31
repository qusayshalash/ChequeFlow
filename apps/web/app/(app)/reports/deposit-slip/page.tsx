'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { utcToday, type DepositSlipView } from '@cheque-flow/shared-types';
import { Button, EmptyState, ErrorState, LoadingState, inputClassName } from '@cheque-flow/ui';

import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { formatDate, money } from '@/lib/format';

/**
 * The day's deposit run, on paper.
 *
 * This is the one screen in the system meant to leave it: the cheques are
 * counted here, printed, and carried to the bank. So the print layout is not an
 * afterthought — the controls disappear, the page turns white, and each bank
 * gets its own sheet with a line to sign.
 */
export default function DepositSlipPage() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();

  const [on, setOn] = useState(utcToday());

  const slip = useQuery<DepositSlipView>({
    queryKey: ['deposit-slip', on],
    queryFn: () => api.getDepositSlip({ on }),
  });

  return (
    <div className="mx-auto max-w-[1000px]">
      <style>{`
        @media print {
          /* Everything that is not the slip: the sidebar, the header, the
             controls. A printed page with a "Print" button on it is a page
             somebody had to explain. */
          .no-print, nav, aside, header { display: none !important; }
          body { background: #fff; }
          .slip-bank { break-inside: avoid; page-break-inside: avoid; }
          .slip-bank + .slip-bank { break-before: page; page-break-before: always; }
        }
      `}</style>

      <div className="no-print">
        <PageHeader
          title={t('reports.depositSlipTitle')}
          actions={
            <Button variant="secondary" onClick={() => window.print()}>
              {t('reports.depositSlipPrint')}
            </Button>
          }
        />

        <p className="mb-4 max-w-[70ch] text-sm text-slate-600">{t('reports.depositSlipHint')}</p>

        <label className="mb-5 inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
          <span className="text-sm text-slate-500">{t('reports.depositSlipDate')}</span>
          <input
            type="date"
            className={`${inputClassName} h-8 border-0 bg-transparent px-0`}
            value={on}
            onChange={(event) => setOn(event.target.value || utcToday())}
          />
        </label>
      </div>

      {slip.isError ? (
        <ErrorState
          title={t('errors.loadFailed')}
          onRetry={() => void slip.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}

      {slip.isPending ? <LoadingState label={t('common.loading')} /> : null}

      {slip.data && slip.data.totalCount === 0 ? (
        <EmptyState title={t('reports.depositSlipEmpty')} />
      ) : null}

      {slip.data && slip.data.overdueCount > 0 ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          {t('reports.depositSlipOverdue', { count: String(slip.data.overdueCount) })}
        </p>
      ) : null}

      <div className="flex flex-col gap-5">
        {(slip.data?.banks ?? []).map((bank) => (
          <section key={bank.bankName || 'none'} className="slip-bank">
            <Panel
              title={`${bank.bankName || t('reports.depositSlipNoBank')} — ${formatDate(
                locale,
                slip.data!.on,
              )}`}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="p-2 text-start text-xs font-medium">{t('cheque.number')}</th>
                      <th className="p-2 text-start text-xs font-medium">{t('cheque.party')}</th>
                      <th className="p-2 text-start text-xs font-medium">{t('cheque.dueDate')}</th>
                      <th className="p-2 text-start text-xs font-medium">{t('common.amount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bank.cheques.map((cheque) => (
                      <tr key={cheque.id}>
                        <td className="p-2 font-semibold text-slate-900 tabular-nums" dir="ltr">
                          {cheque.chequeNumber}
                        </td>
                        <td className="p-2 text-slate-700">
                          {cheque.originalSourceName ?? cheque.drawerName ?? '—'}
                        </td>
                        <td
                          className={`p-2 tabular-nums ${
                            cheque.isOverdue ? 'font-semibold text-red-600' : 'text-slate-700'
                          }`}
                        >
                          {formatDate(locale, cheque.dueDate)}
                        </td>
                        <td className="p-2 font-semibold text-slate-900 tabular-nums">
                          {money(locale, cheque.amount, cheque.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* One line per currency, never a single mixed figure — the bank
                  takes one envelope per currency too. */}
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-200 pt-3">
                {bank.currencies.map((entry) => (
                  <p key={entry.currency} className="text-sm font-bold text-slate-900 tabular-nums">
                    {entry.currency}: {money(locale, entry.total, entry.currency)}
                    <span className="ms-2 font-normal text-slate-500">({entry.count})</span>
                  </p>
                ))}
              </div>

              <div className="mt-6 flex justify-between gap-8 text-xs text-slate-500">
                <span>
                  {t('reports.depositSlipPrepared')}: {formatDate(locale, utcToday())}
                </span>
                <span className="min-w-[180px] border-t border-slate-400 pt-1 text-center">
                  {t('reports.depositSlipSignature')}
                </span>
              </div>
            </Panel>
          </section>
        ))}
      </div>
    </div>
  );
}
