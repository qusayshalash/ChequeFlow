import type { FocusEvent, ReactNode } from 'react';

/**
 * Brings a focused control clear of the fixed action bar.
 *
 * WCAG 2.2 "Focus Not Obscured": a control the user has tabbed to must not be
 * hidden behind fixed furniture. Two obvious approaches do not work here —
 * `scroll-margin-bottom` only applies when the browser decides to scroll, and
 * a control already inside the viewport never triggers one; and
 * `scrollIntoView({ block: 'nearest' })` likewise declines to move an element
 * it already considers visible, scroll margin or not.
 *
 * So the overlap is measured and scrolled away explicitly.
 */
function keepFocusClearOfFixedBar(event: FocusEvent<HTMLElement>): void {
  const bar = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--bulk-bar-height'),
  );
  if (!Number.isFinite(bar) || bar <= 0) return;

  const gap = 16;
  const overlap = event.target.getBoundingClientRect().bottom - (window.innerHeight - bar - gap);
  if (overlap <= 0) return;

  // `instant`, not `auto`: the stylesheet sets `scroll-behavior: smooth`, and
  // `auto` inherits it — a focus correction that animates can leave the
  // control obscured for the length of the animation, which is the very thing
  // being fixed.
  window.scrollBy({ top: overlap, behavior: 'instant' });
}

import { IconChevronDown } from '@/components/icons';

export interface Column<Row> {
  /** Message key for the header cell. */
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Numbers line up better with tabular figures and a narrower cell. */
  numeric?: boolean;
  /** API sort key. Omit for columns that are not meaningfully sortable. */
  sortKey?: string;
}

export interface TableSort {
  key: string;
  direction: 'asc' | 'desc';
  onChange: (key: string, direction: 'asc' | 'desc') => void;
}

/** Row selection, when the table is the target of an action rather than a report. */
export interface TableSelection {
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** Selects or clears every row currently on screen — never other pages. */
  onToggleAll: (keys: string[]) => void;
  /** Accessible label for the header checkbox. */
  selectAllLabel: string;
}

/**
 * The one table used across the app.
 *
 * Wide tables scroll inside their own container rather than pushing the page
 * sideways — on a right-to-left layout a horizontally scrolling page hides the
 * start of every row, which is where the cheque number is.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  empty,
  selection,
  rowLabel,
  sort,
}: {
  columns: ReadonlyArray<Column<Row>>;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  empty?: ReactNode;
  selection?: TableSelection;
  /** What a row's checkbox is called out loud — the key is a uuid, which is not. */
  rowLabel?: (row: Row) => string;
  sort?: TableSort;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const keys = rows.map(rowKey);
  // "All" means all the rows in front of the user. A header checkbox that
  // silently reached other pages would let one click act on cheques nobody
  // has looked at.
  const allSelected = keys.length > 0 && keys.every((key) => selection?.selected.has(key));

  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm">
          <tr className="text-slate-500">
            {selection ? (
              <th scope="col" className="w-12 border-b border-slate-200 px-4 py-3.5">
                <input
                  type="checkbox"
                  aria-label={selection.selectAllLabel}
                  checked={allSelected}
                  onChange={() => selection.onToggleAll(keys)}
                  className="size-4 rounded accent-teal-700"
                />
              </th>
            ) : null}
            {columns.map((column) => {
              const activeSort = Boolean(sort && column.sortKey === sort.key);
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    activeSort
                      ? sort?.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className="whitespace-nowrap border-b border-slate-200 px-4 py-3.5 text-start text-[11px] font-bold tracking-wide text-slate-500"
                >
                  {sort && column.sortKey ? (
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1.5 rounded-md py-1 hover:text-slate-900 ${
                        activeSort ? 'text-teal-700' : ''
                      }`}
                      onClick={() =>
                        sort.onChange(
                          column.sortKey!,
                          activeSort && sort.direction === 'asc' ? 'desc' : 'asc',
                        )
                      }
                    >
                      {column.header}
                      <IconChevronDown
                        width="14"
                        height="14"
                        className={`${
                          activeSort ? 'opacity-100' : 'opacity-35'
                        } ${activeSort && sort.direction === 'asc' ? 'rotate-180' : ''}`}
                      />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody onFocus={selection ? keepFocusClearOfFixedBar : undefined}>
          {rows.map((row) => {
            const key = rowKey(row);
            const isSelected = selection?.selected.has(key) ?? false;
            return (
              <tr
                key={key}
                className={`group transition-colors ${
                  isSelected ? 'bg-teal-50/80' : 'bg-white hover:bg-slate-50/80'
                }`}
              >
                {selection ? (
                  <td className="border-b border-slate-100 px-4 py-3.5">
                    <input
                      type="checkbox"
                      aria-label={rowLabel ? rowLabel(row) : key}
                      checked={isSelected}
                      onChange={() => selection.onToggle(key)}
                      // The action bar is fixed to the bottom of the window, so
                      // a checkbox the browser scrolls "into view" can land
                      // underneath it — WCAG 2.2 calls that focus obscured. The
                      // scroll margin reserves the bar's height, so tabbing
                      // down a long table always leaves the focused row visible.
                      className="size-4 rounded accent-teal-700"
                      // The action bar is fixed to the bottom of the window, so a
                      // checkbox scrolled "into view" can land underneath it —
                      // WCAG 2.2 calls that focus obscured. The bar publishes
                      // its own height, so this stays right however it restyles.
                      style={{ scrollMarginBottom: 'calc(var(--bulk-bar-height, 0px) + 1rem)' }}
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`whitespace-nowrap border-b border-slate-100 px-4 py-3.5 text-slate-700 ${
                      column.numeric ? 'tabular-nums' : ''
                    }`}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
