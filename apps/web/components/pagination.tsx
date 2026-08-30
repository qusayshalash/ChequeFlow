'use client';

import type { Paginated } from '@cheque-flow/shared-types';

import { Button } from '@cheque-flow/ui';
import { useTranslator } from '@/components/providers';

/**
 * Page controls, plus the count.
 *
 * The count is the point. Several lists used to fetch a fixed first page and
 * render it with no indication that anything followed, so a list of sixty
 * contacts silently became a list of fifty — the same defect that made a
 * truncated CSV export look complete.
 */
export function Pagination({
  meta,
  onPageChange,
}: {
  meta: Paginated<unknown>['meta'];
  onPageChange: (page: number) => void;
}) {
  const t = useTranslator();
  const shown = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3"
      aria-label={t('common.page')}
    >
      <Button
        variant="secondary"
        disabled={meta.page <= 1}
        onClick={() => onPageChange(Math.max(1, meta.page - 1))}
      >
        {t('common.previous')}
      </Button>

      <span className="text-sm text-slate-500 tabular-nums">
        {t('common.showingOf', { shown, total: meta.total })}
      </span>

      <Button
        variant="secondary"
        disabled={!meta.hasNextPage}
        onClick={() => onPageChange(meta.page + 1)}
      >
        {t('common.next')}
      </Button>
    </nav>
  );
}
