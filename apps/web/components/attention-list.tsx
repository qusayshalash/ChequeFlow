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
  red: { box: 'bg-danger-soft text-danger', count: 'text-danger' },
  amber: { box: 'bg-warning-soft text-warning', count: 'text-warning' },
  teal: { box: 'bg-primary-soft text-primary-ink', count: 'text-primary-ink' },
  slate: { box: 'bg-sunken text-ink-muted', count: 'text-ink-soft' },
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
    <section className="flex min-w-0 flex-col rounded-2xl border border-line/90 bg-surface p-4 shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-ink-faint" aria-hidden="true">
          <IconBell width="18" height="18" />
        </span>
        <h2 className="text-[15px] font-bold text-ink">{t('dashboard.needsYourAttention')}</h2>
      </div>

      <ul className="flex flex-1 flex-col gap-2">
        {items.map((item) => {
          const palette = TONES[item.tone];
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-xl border border-line-soft bg-surface p-3 transition hover:border-line hover:bg-subtle/70"
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${palette.box}`}
                >
                  <item.Icon width="18" height="18" />
                </span>

                <span className="min-w-0 flex-1 text-end">
                  <span className="block truncate text-[13px] font-semibold text-ink">
                    {item.label}
                  </span>
                  {item.amount ? (
                    <span className="mt-0.5 block truncate text-[11px] text-ink-muted tabular-nums">
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
        className="mt-3 flex h-10 items-center justify-center gap-1 rounded-xl border border-line text-[13px] font-semibold text-ink-soft transition hover:border-line-strong hover:bg-subtle"
      >
        {t('dashboard.viewAllAlerts')}
        <IconChevronEnd width="15" height="15" />
      </Link>
    </section>
  );
}
