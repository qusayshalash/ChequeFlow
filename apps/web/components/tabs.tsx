'use client';

import type { ReactNode } from 'react';

export interface TabDefinition {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Shown as a small count beside the label, when there is one worth showing. */
  count?: number;
  /**
   * Colours the count, so a filter reads as its own status — bounced in red,
   * cleared in green. Left off, the count is neutral.
   */
  tone?: keyof typeof TONES;
}

/** Count colours. Neutral unless the tab stands for a status. */
const TONES = {
  slate: 'bg-slate-100 text-slate-600',
  violet: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  emerald: 'bg-emerald-100 text-emerald-700',
} as const;

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
      // Underlined text on a rule, not pills in a box. A boxed strip of pills
      // is a second card competing with the content below it; the underline
      // says "you are here" with one line and no chrome.
      className="-mb-px flex gap-6 overflow-x-auto border-b border-slate-200"
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
            className={`inline-flex h-11 shrink-0 items-center gap-2 border-b-2 text-sm font-semibold transition-colors ${
              selected
                ? 'border-teal-700 text-slate-950'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab.icon ? (
              <span className={selected ? 'text-teal-700' : 'text-slate-400'} aria-hidden>
                {tab.icon}
              </span>
            ) : null}
            {tab.label}
            {/* Zero still prints. "Bounced 0" is an answer; a count that
                disappears makes the reader open the tab to find out. */}
            {tab.count === undefined ? null : (
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${
                  TONES[tab.tone ?? 'slate']
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
