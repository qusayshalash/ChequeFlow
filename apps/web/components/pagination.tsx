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
  const pages = [...new Set([1, meta.page - 1, meta.page, meta.page + 1, meta.totalPages])].filter(
    (page) => page >= 1 && page <= meta.totalPages,
  );

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-[0_1px_2px_rgb(16_24_40/0.035)]"
      aria-label={t('common.page')}
    >
      <Button
        variant="secondary"
        disabled={meta.page <= 1}
        onClick={() => onPageChange(Math.max(1, meta.page - 1))}
      >
        {t('common.previous')}
      </Button>

      <span className="order-first w-full text-center text-sm text-slate-500 tabular-nums sm:order-none sm:w-auto">
        {t('common.showingOf', { shown, total: meta.total })}
      </span>

      {meta.totalPages > 1 ? (
        <div className="order-last flex items-center gap-1 sm:order-none">
          {pages.map((page, index) => (
            <span key={page} className="contents">
              {index > 0 && page - pages[index - 1]! > 1 ? (
                <span className="px-1 text-slate-400" aria-hidden="true">
                  …
                </span>
              ) : null}
              <button
                type="button"
                aria-label={`${t('common.page')} ${page}`}
                aria-current={page === meta.page ? 'page' : undefined}
                onClick={() => onPageChange(page)}
                className={`size-9 rounded-lg text-sm font-semibold tabular-nums transition-colors ${
                  page === meta.page
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                {page}
              </button>
            </span>
          ))}
        </div>
      ) : null}

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
