'use client';

import type { Paginated } from '@cheque-flow/shared-types';

import { Button } from '@cheque-flow/ui';
import { useTranslator } from '@/components/providers';

/** Sizes offered when a list lets you choose. */
const PAGE_SIZES = [10, 20, 50, 100] as const;

/**
 * Page controls, plus the count.
 *
 * The count is the point. Several lists used to fetch a fixed first page and
 * render it with no indication that anything followed, so a list of sixty
 * contacts silently became a list of fifty — the same defect that made a
 * truncated CSV export look complete.
 *
 * Two groups, not four. `justify-between` used to spread all four children
 * across the full bar: on a 1256px list that put "previous" at x1169, the
 * count at x679, the page numbers at x342 and "next" at x13 — three separate
 * places to look in order to do one thing. The pager is one unit now, and the
 * count sits at the other end because it describes the list rather than moves
 * through it.
 */
export function Pagination({
  meta,
  onPageChange,
  onPageSizeChange,
}: {
  meta: Paginated<unknown>['meta'];
  onPageChange: (page: number) => void;
  /**
   * Given only by lists where the size is worth changing. Without it the
   * control is left out rather than shown inert — a select that cannot change
   * anything is worse than no select.
   */
  onPageSizeChange?: (pageSize: number) => void;
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
      {/* What the list contains, and how much of it is shown at a time. */}
      <span className="flex min-w-0 items-center gap-3 text-sm text-slate-500 tabular-nums">
        {t('common.showingOf', { shown, total: meta.total })}

        {onPageSizeChange ? (
          <select
            aria-label={t('common.rowsPerPage')}
            className="h-11 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none hover:border-slate-300"
            value={meta.pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {/* The list's own size is always offered, even when it is not one
                of the four — otherwise the select would show a value it does
                not contain and silently read as one of them. */}
            {[...new Set([...PAGE_SIZES, meta.pageSize])]
              .sort((a, b) => a - b)
              .map((size) => (
                <option key={size} value={size}>
                  {t('common.perPage', { count: size })}
                </option>
              ))}
          </select>
        ) : null}
      </span>

      {/* The pager itself: back, where you are, forward — adjacent, in that
          order, so it reads as one control. */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(Math.max(1, meta.page - 1))}
        >
          {t('common.previous')}
        </Button>

        {meta.totalPages > 1 ? (
          <div className="flex items-center gap-1">
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
                  // The same height as the buttons beside it. At 36px against
                  // their 44 the numbers read as a different, lesser control.
                  className={`size-11 rounded-lg text-sm font-semibold tabular-nums transition-colors ${
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
      </div>
    </nav>
  );
}
