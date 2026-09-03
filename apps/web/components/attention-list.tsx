'use client';

import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';

import { IconBell, IconChevronEnd } from '@/components/icons';
import { useTranslator } from '@/components/providers';

export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  /** Already formatted, per currency where there is more than one. */
  amount?: string;
  tone: 'red' | 'amber' | 'teal' | 'slate';
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  href: string;
}

const TONES = {
  red: { box: 'bg-red-50 text-red-500', count: 'text-red-500' },
  amber: { box: 'bg-amber-50 text-amber-500', count: 'text-amber-500' },
  teal: { box: 'bg-teal-50 text-teal-700', count: 'text-teal-700' },
  slate: { box: 'bg-slate-100 text-slate-500', count: 'text-slate-600' },
} as const;

/**
 * The four things worth looking at before anything else.
 *
 * Deliberately not a feed of everything that happened: this answers "what do I
 * have to do today", and every row is a link to the list that answers it. The
 * count is the largest thing on the row because it is what decides whether the
 * row is worth opening at all.
 *
 * A row with nothing in it still prints. "Bounced: 0" is a useful sentence,
 * and a panel whose rows come and go is one people stop trusting to be
 * complete.
 */
export function AttentionList({ items }: { items: readonly AttentionItem[] }) {
  const t = useTranslator();

  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-slate-300" aria-hidden="true">
          <IconBell width="18" height="18" />
        </span>
        <h2 className="text-[15px] font-bold text-slate-900">
          {t('dashboard.needsYourAttention')}
        </h2>
      </div>

      <ul className="flex flex-1 flex-col gap-2">
        {items.map((item) => {
          const palette = TONES[item.tone];
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 transition hover:border-slate-200 hover:bg-slate-50/70"
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${palette.box}`}
                >
                  <item.Icon width="18" height="18" />
                </span>

                <span className="min-w-0 flex-1 text-end">
                  <span className="block truncate text-[13px] font-semibold text-slate-800">
                    {item.label}
                  </span>
                  {item.amount ? (
                    <span className="mt-0.5 block truncate text-[11px] text-slate-400 tabular-nums">
                      {t('dashboard.totalAmount')} {item.amount}
                    </span>
                  ) : null}
                </span>

                <span className={`shrink-0 text-xl font-bold tabular-nums ${palette.count}`}>
                  {item.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <Link
        href="/notifications"
        className="mt-3 flex h-10 items-center justify-center gap-1 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
      >
        {t('dashboard.viewAllAlerts')}
        <IconChevronEnd width="15" height="15" />
      </Link>
    </section>
  );
}
