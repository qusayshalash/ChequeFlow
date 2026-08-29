'use client';

import Link from 'next/link';

import type { ChequeSummaryView } from '@cheque-flow/shared-types';
import { EmptyState, StatusBadge } from '@cheque-flow/ui';

import { useApp, useTranslator } from '@/components/providers';
import { formatDate, isOverdue, money } from '@/lib/format';

/** Reusable cheque list, shared by /cheques, /cheques/due and /cheques/bounced. */
export function ChequeTable({ cheques }: { cheques: ChequeSummaryView[] }) {
  const t = useTranslator();
  const { locale } = useApp();

  if (cheques.length === 0) {
    return <EmptyState title={t('cheque.emptyList')} />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[880px] text-start text-sm">
        <caption className="sr-only">{t('cheque.listTitle')}</caption>
        <thead className="bg-slate-50 text-slate-700">
          <tr>
            <th scope="col" className="p-3 text-start font-medium">
              {t('cheque.number')}
            </th>
            <th scope="col" className="p-3 text-start font-medium">
              {t('common.amount')}
            </th>
            <th scope="col" className="p-3 text-start font-medium">
              {t('cheque.dueDate')}
            </th>
            <th scope="col" className="p-3 text-start font-medium">
              {t('common.status')}
            </th>
            <th scope="col" className="p-3 text-start font-medium">
              {t('cheque.originalSource')}
            </th>
            <th scope="col" className="p-3 text-start font-medium">
              {t('cheque.currentLocation')}
            </th>
            <th scope="col" className="p-3 text-start font-medium">
              {t('cheque.bank')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cheques.map((cheque) => (
            <tr key={cheque.id} className="hover:bg-slate-50">
              <td className="p-3">
                <Link
                  href={`/cheques/${cheque.id}`}
                  className="font-medium text-teal-800 underline-offset-2 hover:underline"
                  dir="ltr"
                >
                  {cheque.chequeNumber}
                </Link>
              </td>
              <td className="p-3 tabular-nums">{money(locale, cheque.amount, cheque.currency)}</td>
              <td className={`p-3 tabular-nums ${isOverdue(cheque.dueDate) ? 'text-red-700' : ''}`}>
                {formatDate(locale, cheque.dueDate)}
              </td>
              <td className="p-3">
                <StatusBadge status={cheque.status} label={t(`status.${cheque.status}`)} />
              </td>
              <td className="p-3">{cheque.originalSourceName ?? t('common.unknown')}</td>
              <td className="p-3">{cheque.currentLocationName ?? t('common.unknown')}</td>
              <td className="p-3">{cheque.bankName ?? t('common.unknown')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
