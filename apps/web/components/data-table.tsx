import type { ReactNode } from 'react';

export interface Column<Row> {
  /** Message key for the header cell. */
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Numbers line up better with tabular figures and a narrower cell. */
  numeric?: boolean;
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
}: {
  columns: ReadonlyArray<Column<Row>>;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  empty?: ReactNode;
  selection?: TableSelection;
  /** What a row's checkbox is called out loud — the key is a uuid, which is not. */
  rowLabel?: (row: Row) => string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const keys = rows.map(rowKey);
  // "All" means all the rows in front of the user. A header checkbox that
  // silently reached other pages would let one click act on cheques nobody
  // has looked at.
  const allSelected = keys.length > 0 && keys.every((key) => selection?.selected.has(key));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-slate-500">
            {selection ? (
              <th scope="col" className="w-12 p-4">
                <input
                  type="checkbox"
                  aria-label={selection.selectAllLabel}
                  checked={allSelected}
                  onChange={() => selection.onToggleAll(keys)}
                  className="size-4 accent-teal-800"
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th key={column.key} scope="col" className="p-4 text-start text-xs font-medium">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const key = rowKey(row);
            const isSelected = selection?.selected.has(key) ?? false;
            return (
              <tr key={key} className={isSelected ? 'bg-teal-50' : 'hover:bg-slate-50'}>
                {selection ? (
                  <td className="p-4">
                    <input
                      type="checkbox"
                      aria-label={rowLabel ? rowLabel(row) : key}
                      checked={isSelected}
                      onChange={() => selection.onToggle(key)}
                      className="size-4 accent-teal-800"
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`p-4 text-slate-700 ${column.numeric ? 'tabular-nums' : ''}`}
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
