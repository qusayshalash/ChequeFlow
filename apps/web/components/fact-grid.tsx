import type { ReactNode } from 'react';

export interface Fact {
  label: string;
  value: ReactNode;
  /** Identifiers stay left-to-right even in an Arabic layout. */
  ltr?: boolean;
}

/**
 * A group of related facts.
 *
 * Grouped rather than listed: fifteen fields in one flat run gives the bank
 * branch the same weight as the amount, and the reader has to scan all of them
 * to find any one of them.
 */
export function FactGrid({
  facts,
  columns,
}: {
  facts: readonly Fact[];
  /**
   * Forced to one when the group sits in a narrow card. Left unset the grid
   * widens with the viewport, which is right for a full-width group and wrong
   * inside a third of a row — there it produces two-character columns.
   */
  columns?: 1;
}) {
  return (
    <dl className={`grid gap-x-8 gap-y-5 ${columns === 1 ? '' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0 border-s-2 border-slate-100 ps-3">
          <dt className="text-[11px] font-semibold tracking-wide text-slate-400">{fact.label}</dt>
          <dd
            className={`mt-1.5 truncate text-sm font-semibold text-slate-900 ${
              fact.ltr ? 'tabular-nums' : ''
            }`}
            dir={fact.ltr ? 'ltr' : undefined}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
