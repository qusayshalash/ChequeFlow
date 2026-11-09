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
  mobileCards = true,
}: {
  columns: ReadonlyArray<Column<Row>>;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  empty?: ReactNode;
  selection?: TableSelection;
  /** What a row's checkbox is called out loud — the key is a uuid, which is not. */
  rowLabel?: (row: Row) => string;
  sort?: TableSort;
  /**
   * Below `md`, each row as a card: the first column is its title and every
   * other column a labelled field. On by default; a caller with cards of its
   * own turns it off.
   */
  mobileCards?: boolean;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const keys = rows.map(rowKey);
  // "All" means all the rows in front of the user. A header checkbox that
  // silently reached other pages would let one click act on cheques nobody
  // has looked at.
  const allSelected = keys.length > 0 && keys.every((key) => selection?.selected.has(key));

  // A 760px table in a 375px phone showed two columns and hid the rest behind
  // a sideways scroll: a contact's phone and balance, a user's role and status.
  const [title, ...fields] = columns;
  const isControl = (column: Column<Row>) => column.key === 'actions' || column.header === '';
  const cards =
    mobileCards && title ? (
      <ul className="flex flex-col gap-2.5 p-3 md:hidden">
        {rows.map((row) => {
          const key = rowKey(row);
          const isSelected = selection?.selected.has(key) ?? false;
          return (
            <li
              key={key}
              className={`rounded-2xl border p-3.5 ${
                isSelected ? 'border-primary bg-primary-soft/60' : 'border-line/90 bg-surface'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {selection ? (
                  <input
                    type="checkbox"
                    aria-label={rowLabel ? rowLabel(row) : key}
                    checked={isSelected}
                    onChange={() => selection.onToggle(key)}
                    className="size-5 shrink-0 rounded accent-teal-700"
                  />
                ) : null}
                <div className="min-w-0 flex-1 font-semibold text-ink">{title.cell(row)}</div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {fields
                  .filter((column) => !isControl(column))
                  .map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="text-[11px] font-semibold text-ink-muted">{column.header}</dt>
                      <dd
                        className={`mt-0.5 truncate text-ink-soft ${
                          column.numeric ? 'tabular-nums' : ''
                        }`}
                      >
                        {column.cell(row)}
                      </dd>
                    </div>
                  ))}
              </dl>
              {fields.filter(isControl).map((column) => (
                <div key={column.key} className="mt-3 border-t border-line-soft pt-3">
                  {column.cell(row)}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <>
      {cards}
      <div className={`max-h-[70vh] overflow-auto ${cards ? 'hidden md:block' : ''}`}>
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-subtle/95 backdrop-blur-sm">
            <tr className="text-ink-muted">
              {selection ? (
                <th scope="col" className="w-12 border-b border-line px-2 py-1.5">
                  {/* The box stays 16px; the label around it is what you hit. */}
                  <label className="flex size-11 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      aria-label={selection.selectAllLabel}
                      checked={allSelected}
                      onChange={() => selection.onToggleAll(keys)}
                      className="size-4 rounded accent-teal-700"
                    />
                  </label>
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
                    className="whitespace-nowrap border-b border-line px-4 py-3.5 text-start text-[11px] font-bold tracking-wide text-ink-muted"
                  >
                    {sort && column.sortKey ? (
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1.5 rounded-md py-1 hover:text-ink ${
                          activeSort ? 'text-primary-ink' : ''
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
                    isSelected ? 'bg-primary-soft/80' : 'bg-surface hover:bg-subtle/80'
                  }`}
                >
                  {selection ? (
                    <td className="border-b border-line-soft px-2 py-1.5">
                      {/* The visible box is 16px, which is under the 24px WCAG 2.2
                        asks of a pointer target and is a poor thing to hit on a
                        touch screen — and it is the only way into the whole bulk
                        workflow. The label around it is the target instead, so
                        the row still looks the same and 44px of it is clickable. */}
                      <label className="flex size-11 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          aria-label={rowLabel ? rowLabel(row) : key}
                          checked={isSelected}
                          onChange={() => selection.onToggle(key)}
                          className="size-4 rounded accent-teal-700"
                          // The action bar sticks to the bottom of the list, so a
                          // checkbox the browser scrolls "into view" can land
                          // underneath it — WCAG 2.2 calls that focus obscured. The
                          // bar publishes its own height, so this stays right
                          // however it is restyled.
                          style={{ scrollMarginBottom: 'calc(var(--bulk-bar-height, 0px) + 1rem)' }}
                        />
                      </label>
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`whitespace-nowrap border-b border-line-soft px-4 py-3.5 text-ink-soft ${
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
    </>
  );
}
