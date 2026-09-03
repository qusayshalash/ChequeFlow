'use client';

import type { ReactNode } from 'react';

import { IconSearch } from '@/components/icons';

/**
 * The band at the top of every page: what you are looking at on one side, and
 * the things you can do about it on the other.
 */
export function PageHeader({
  title,
  subtitle,
  search,
  actions,
}: {
  title: string;
  subtitle?: string;
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-5 border-b border-slate-200/80 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 max-w-2xl">
        <span className="mb-2 block h-1 w-8 rounded-full bg-teal-600" aria-hidden="true" />
        <h1 className="text-[clamp(1.55rem,2vw,2rem)] font-bold tracking-[-0.025em] text-slate-950">
          {title}
        </h1>
        {subtitle ? <p className="mt-1.5 text-sm leading-6 text-slate-500">{subtitle}</p> : null}
      </div>

      <div className="flex min-w-0 flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
        {search ? (
          <label className="relative flex min-w-0 flex-1 items-center sm:w-72 sm:flex-none">
            <span className="pointer-events-none absolute start-3 text-slate-400">
              <IconSearch width="18" height="18" />
            </span>
            <input
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder}
              aria-label={search.placeholder}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white ps-10 pe-3 text-sm text-slate-800 shadow-sm outline-none placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
            />
          </label>
        ) : null}
        {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      </div>
    </div>
  );
}
