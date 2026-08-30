import type { ReactNode } from 'react';

export interface Column<Row> {
  /** Message key for the header cell. */
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Numbers line up better with tabular figures and a narrower cell. */
  numeric?: boolean;
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
}: {
  columns: ReadonlyArray<Column<Row>>;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  empty?: ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-slate-500">
            {columns.map((column) => (
              <th key={column.key} scope="col" className="p-4 text-start text-xs font-medium">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-slate-50">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`p-4 text-slate-700 ${column.numeric ? 'tabular-nums' : ''}`}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
