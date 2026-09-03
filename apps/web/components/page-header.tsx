'use client';

import type { ReactNode } from 'react';

/**
 * The band at the top of every page: what you are looking at on one side, and
 * the things you can do about it on the other.
 *
 * Two things it deliberately no longer carries:
 *
 *  - **A search field.** Every list had one here while the top bar had another
 *    three centimetres above it, and nothing on screen said which searched
 *    what. A list's search is a filter over that list, so it now sits in the
 *    filter row beside the other filters, where its scope is obvious; the top
 *    bar keeps the one search that crosses pages.
 *  - **Its old height.** A decorative rule, a 2rem title, a subtitle and 48px
 *    of padding came to roughly a fifth of a laptop screen before the first
 *    row of data. The type is smaller, the padding halved, and the subtitle
 *    only prints where it says something the title does not.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-xl font-bold tracking-[-0.02em] text-slate-950 sm:text-[1.4rem]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 truncate text-sm text-slate-500" title={subtitle}>
            {subtitle}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>
      ) : null}
    </div>
  );
}
