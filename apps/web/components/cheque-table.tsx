'use client';

import Link from 'next/link';

import type { ChequeSummaryView } from '@cheque-flow/shared-types';
import { EmptyState, StatusBadge } from '@cheque-flow/ui';

import { DataTable } from '@/components/data-table';
import { useApp, useTranslator } from '@/components/providers';
import { formatDate, money } from '@/lib/format';

/** Reusable cheque list, shared by /cheques, /cheques/due and /cheques/bounced. */
export function ChequeTable({ cheques }: { cheques: ChequeSummaryView[] }) {
  const t = useTranslator();
  const { locale } = useApp();

  return (
    <DataTable
      rows={cheques}
      rowKey={(cheque) => cheque.id}
      empty={<EmptyState title={t('cheque.emptyList')} />}
      columns={[
        {
          key: 'number',
          header: t('cheque.number'),
          cell: (cheque) => (
            <Link
              href={`/cheques/${cheque.id}`}
              className="font-semibold text-slate-900 tabular-nums hover:text-teal-700"
              dir="ltr"
            >
              {cheque.chequeNumber}
            </Link>
          ),
        },
        {
          key: 'party',
          header: t('cheque.party'),
          cell: (cheque) => cheque.originalSourceName ?? cheque.drawerName ?? '—',
        },
        {
          key: 'bank',
          header: t('cheque.bank'),
          cell: (cheque) => cheque.bankName ?? '—',
        },
        {
          key: 'due',
          header: t('cheque.dueDate'),
          numeric: true,
          // `isOverdue` comes from the API, which applies the one shared rule:
          // past due *and* still outstanding. Comparing dates here would paint
          // a cheque cleared years ago red.
          cell: (cheque) => (
            <span className={cheque.isOverdue ? 'font-semibold text-red-600' : ''}>
              {formatDate(locale, cheque.dueDate)}
            </span>
          ),
        },
        {
          key: 'amount',
          header: t('common.amount'),
          numeric: true,
          cell: (cheque) => (
            <span className="font-semibold text-slate-900">
              {money(locale, cheque.amount, cheque.currency)}
            </span>
          ),
        },
        {
          key: 'location',
          header: t('cheque.currentLocation'),
          cell: (cheque) => cheque.currentLocationName ?? '—',
        },
        {
          key: 'status',
          header: t('cheque.status'),
          cell: (cheque) => (
            <StatusBadge status={cheque.status} label={t(`status.${cheque.status}`)} />
          ),
        },
      ]}
    />
  );
}
