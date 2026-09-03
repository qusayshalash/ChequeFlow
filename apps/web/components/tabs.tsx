'use client';

import type { ReactNode } from 'react';

export interface TabDefinition {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Shown as a small count beside the label, when there is one worth showing. */
  count?: number;
}

/**
 * The tab strip on a record's page.
 *
 * A cheque carries four separable things — what it is, where it has been, its
 * photographs, and who touched it — and stacking all four made the page a long
 * scroll in which the ledger, the part people open the record for, sat at the
 * bottom. Tabs put each one reachable in a click.
 *
 * Rendered as real buttons with `role="tab"`, so the arrow keys work and a
 * screen reader announces which of four this is.
 */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly TabDefinition[];
  active: string;
  onChange: (key: string) => void;
}) {
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const index = tabs.findIndex((tab) => tab.key === active);
    if (index === -1) return;

    // In a right-to-left strip the arrows still mean "the tab drawn that way",
    // so the direction is flipped to match what the user sees.
    const delta = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
    if (delta === 0) return;

    event.preventDefault();
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (next) onChange(next.key);
  }

  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5"
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${
              selected
                ? 'bg-teal-50 text-teal-900 ring-1 ring-teal-200'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {tab.icon ? (
              <span className={selected ? 'text-teal-700' : 'text-slate-400'} aria-hidden>
                {tab.icon}
              </span>
            ) : null}
            {tab.label}
            {tab.count !== undefined && tab.count > 0 ? (
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${
                  selected ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
