'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { utcToday, type ChequeSummaryView } from '@cheque-flow/shared-types';
import { EmptyState, StatusBadge } from '@cheque-flow/ui';

import {
  DataTable,
  type Column,
  type TableSelection,
  type TableSort,
} from '@/components/data-table';
import { BankMark } from '@/components/bank-mark';
import { IconClock } from '@/components/icons';
import { RowActions } from '@/components/row-actions';
import { useApp, useTranslator } from '@/components/providers';
import { formatDate, formatDueDistance, money } from '@/lib/format';

/** The canonical columns used by every cheque data grid. */
export const CHEQUE_COLUMN_KEYS = [
  'number',
  'party',
  'bank',
  'due',
  'amount',
  'location',
  'status',
] as const;

export type ChequeColumnKey = (typeof CHEQUE_COLUMN_KEYS)[number];

export function ChequeTable({
  cheques,
  selection,
  emptyAction,
  emptyDescription,
  visibleColumns,
  sort,
}: {
  cheques: ChequeSummaryView[];
  selection?: TableSelection;
  emptyAction?: ReactNode;
  emptyDescription?: string;
  visibleColumns?: ReadonlySet<string>;
  sort?: TableSort;
}) {
  const t = useTranslator();
  const { locale } = useApp();
  // One reference day for the whole table, so no row straddles midnight.
  const today = utcToday();

  const columns: Array<Column<ChequeSummaryView>> = [
    // Column order follows the supplied design: what the cheque is,
    // then its state and value, then when, then who and where.
    {
      key: 'number',
      header: t('cheque.number'),
      sortKey: 'chequeNumber',
      cell: (cheque) => (
        <Link
          href={`/cheques/${cheque.id}`}
          className="font-semibold text-slate-950 tabular-nums hover:text-teal-700"
          dir="ltr"
        >
          {cheque.chequeNumber}
        </Link>
      ),
    },
    {
      key: 'status',
      header: t('cheque.status'),
      sortKey: 'status',
      cell: (cheque) => <StatusBadge status={cheque.status} label={t(`status.${cheque.status}`)} />,
    },
    {
      key: 'amount',
      header: t('common.amount'),
      sortKey: 'amount',
      numeric: true,
      cell: (cheque) => (
        <span className="font-semibold text-slate-950">
          {money(locale, cheque.amount, cheque.currency)}
        </span>
      ),
    },
    {
      key: 'due',
      header: t('cheque.dueDate'),
      sortKey: 'dueDate',
      numeric: true,
      // The date, and under it how far away it is. A calendar date alone makes
      // the reader do the arithmetic on every row; "tomorrow" is the part they
      // are actually scanning for.
      cell: (cheque) => (
        <span className="block leading-tight">
          <span
            className={
              cheque.isOverdue
                ? 'inline-flex items-center gap-1.5 font-semibold text-red-600'
                : 'font-medium text-slate-700'
            }
          >
            {cheque.isOverdue ? (
              <>
                <IconClock className="size-4 shrink-0" aria-hidden="true" />
                <span className="sr-only">{t('cheque.overdueLabel')}</span>
              </>
            ) : null}
            {formatDate(locale, cheque.dueDate)}
          </span>
          <span
            className={`mt-0.5 block text-xs ${
              cheque.isOverdue ? 'font-semibold text-red-500' : 'text-slate-400'
            }`}
          >
            {formatDueDistance(locale, cheque.dueDate, today)}
          </span>
        </span>
      ),
    },
    {
      key: 'bank',
      header: t('cheque.drawnOnBank'),
      // The mark is what the eye latches onto while scrolling a long list; the
      // name is what confirms it.
      cell: (cheque) => (
        <span className="flex items-center gap-2.5">
          <BankMark name={cheque.bankName} size="sm" />
          <span className="truncate">{cheque.bankName ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'party',
      header: t('cheque.beneficiary'),
      // Whoever the cheque is *about* from this organisation's side: for one
      // coming in that is the party it came from, for one going out the party
      // it was handed to. The drawer is the fallback when neither is on file.
      cell: (cheque) => (
        <span className="truncate">
          {(cheque.direction === 'OUTGOING'
            ? cheque.currentRecipientName
            : cheque.originalSourceName) ??
            cheque.drawerName ??
            '—'}
        </span>
      ),
    },
    {
      key: 'location',
      header: t('cheque.storageLocation'),
      cell: (cheque) => cheque.currentLocationName ?? '—',
    },
    {
      key: 'actions',
      header: '',
      cell: (cheque) => (
        <RowActions
          label={cheque.chequeNumber}
          actions={[
            {
              key: 'open',
              label: t('cheque.openCheque'),
              href: `/cheques/${cheque.id}`,
            },
            {
              key: 'timeline',
              label: t('cheque.openTimeline'),
              href: `/cheques/${cheque.id}/timeline`,
            },
            {
              key: 'copy',
              label: t('cheque.copyNumber'),
              onSelect: () => void navigator.clipboard?.writeText(cheque.chequeNumber),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable<ChequeSummaryView>
      rows={cheques}
      rowKey={(cheque) => cheque.id}
      {...(selection ? { selection } : {})}
      {...(sort ? { sort } : {})}
      rowLabel={(cheque) => `${t('bulk.selectRow')} ${cheque.chequeNumber}`}
      empty={
        <EmptyState
          title={t('cheque.emptyList')}
          description={emptyDescription}
          action={emptyAction}
        />
      }
      // The actions column is furniture, not data: it is exempt from the
      // column picker, because a row you cannot act on is a row with a dead
      // end, and nobody chooses that deliberately.
      columns={columns.filter(
        (column) => column.key === 'actions' || !visibleColumns || visibleColumns.has(column.key),
      )}
    />
  );
}
