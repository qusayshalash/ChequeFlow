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
    <div className="mb-6 flex flex-col gap-4 lg:flex-row-reverse lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {actions}
        {search ? (
          <label className="relative flex min-w-0 flex-1 items-center lg:w-80 lg:flex-none">
            <span className="pointer-events-none absolute start-3 text-slate-400">
              <IconSearch />
            </span>
            <input
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder}
              aria-label={search.placeholder}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white ps-10 pe-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
