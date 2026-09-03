'use client';

import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';

import { IconDots } from '@/components/icons';
import { useTranslator } from '@/components/providers';

/**
 * Accents carry meaning, not decoration: red is money that needs chasing,
 * amber is money due soon, teal is money in hand, green is money on its way.
 */
export type StatTone = 'neutral' | 'teal' | 'green' | 'amber' | 'red';

const TONES: Record<StatTone, { iconBg: string; iconFg: string; amount: string }> = {
  neutral: { iconBg: 'bg-slate-100', iconFg: 'text-slate-500', amount: 'text-slate-700' },
  teal: { iconBg: 'bg-teal-50', iconFg: 'text-teal-700', amount: 'text-teal-700' },
  green: { iconBg: 'bg-emerald-50', iconFg: 'text-emerald-600', amount: 'text-emerald-600' },
  amber: { iconBg: 'bg-amber-50', iconFg: 'text-amber-500', amount: 'text-amber-500' },
  red: { iconBg: 'bg-red-50', iconFg: 'text-red-500', amount: 'text-red-500' },
};

/**
 * One headline figure on the dashboard.
 *
 * Three tiers, in the order the eye needs them: what this counts, how many,
 * and what that is worth. The amount is the only coloured text on the card —
 * it is the part that says whether the count is good news.
 *
 * `href` makes the whole card the link to the list behind it, so the number
 * and the way to act on it are the same target rather than a figure with a
 * separate link hidden underneath.
 */
export function StatCard({
  label,
  value,
  amountLabel,
  amount,
  tone = 'neutral',
  Icon,
  href,
}: {
  label: string;
  value: string;
  /** Caption above the money, e.g. "total amount". */
  amountLabel?: string;
  /** Already formatted, and per currency where there is more than one. */
  amount?: string;
  tone?: StatTone;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  href?: string;
}) {
  const t = useTranslator();
  const palette = TONES[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${palette.iconBg} ${palette.iconFg}`}
        >
          <Icon width="22" height="22" />
        </span>

        <span className="min-w-0 flex-1 text-end">
          <span className="block truncate text-[13px] font-medium text-slate-500">{label}</span>
          <span className="mt-1 block text-[28px] leading-none font-bold tracking-[-0.03em] text-slate-900 tabular-nums">
            {value}
          </span>
        </span>

        {/* Present because the card is a shortcut, not a control surface: it
            opens the list this figure counts. Rendered as a plain mark rather
            than a menu button so it never looks like an action that is
            missing its menu. */}
        <span className="-me-1 -mt-1 shrink-0 text-slate-300" aria-hidden="true">
          <IconDots width="16" height="16" />
        </span>
      </div>

      {amount ? (
        <div className="mt-4">
          <span className="block text-[11px] font-medium text-slate-400">
            {amountLabel ?? t('common.amount')}
          </span>
          <span className={`mt-0.5 block text-sm font-bold tabular-nums ${palette.amount}`}>
            {amount}
          </span>
        </div>
      ) : null}
    </>
  );

  const shell =
    'block rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgb(16_24_40/0.04)]';

  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link
      href={href}
      className={`${shell} transition hover:border-slate-300 hover:shadow-[0_10px_26px_-20px_rgb(16_24_40/0.45)]`}
    >
      {body}
    </Link>
  );
}
