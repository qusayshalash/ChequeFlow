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
export function FactGrid({ facts }: { facts: readonly Fact[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
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
