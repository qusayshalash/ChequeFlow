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
  neutral: { iconBg: 'bg-sunken', iconFg: 'text-ink-muted', amount: 'text-ink-soft' },
  teal: { iconBg: 'bg-primary-soft', iconFg: 'text-primary-ink', amount: 'text-primary-ink' },
  green: { iconBg: 'bg-success-soft', iconFg: 'text-success', amount: 'text-success' },
  amber: { iconBg: 'bg-warning-soft', iconFg: 'text-warning', amount: 'text-warning' },
  red: { iconBg: 'bg-danger-soft', iconFg: 'text-danger', amount: 'text-danger' },
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
  breakdown,
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
  /** Labelled lines in place of the single amount, e.g. incoming and outgoing. */
  breakdown?: ReadonlyArray<{ label: string; value: string }>;
}) {
  const t = useTranslator();
  const palette = TONES[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-11 ${palette.iconBg} ${palette.iconFg}`}
        >
          <Icon width="22" height="22" />
        </span>

        <span className="min-w-0 flex-1 text-end">
          <span className="block text-[13px] leading-snug font-medium text-ink-muted sm:truncate">
            {label}
          </span>
          <span className="mt-1 block text-2xl leading-none sm:text-[28px] font-bold tracking-[-0.03em] text-ink tabular-nums">
            {value}
          </span>
        </span>

        {/* Present because the card is a shortcut, not a control surface: it
            opens the list this figure counts. Rendered as a plain mark rather
            than a menu button so it never looks like an action that is
            missing its menu. */}
        <span className="-me-1 -mt-1 hidden shrink-0 text-ink-faint sm:block" aria-hidden="true">
          <IconDots width="16" height="16" />
        </span>
      </div>

      {breakdown ? (
        <dl className="mt-4 space-y-1.5">
          {breakdown.map((line) => (
            <div key={line.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-[11px] font-medium text-ink-muted">{line.label}</dt>
              <dd className={`text-sm font-bold tabular-nums ${palette.amount}`}>{line.value}</dd>
            </div>
          ))}
        </dl>
      ) : amount ? (
        <div className="mt-4">
          <span className="block text-[11px] font-medium text-ink-muted">
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
    'block rounded-2xl border border-line/90 bg-surface p-3 sm:p-4 shadow-[0_1px_2px_rgb(16_24_40/0.04)]';

  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link
      href={href}
      className={`${shell} transition hover:border-line-strong hover:shadow-[0_10px_26px_-20px_rgb(16_24_40/0.45)]`}
    >
      {body}
    </Link>
  );
}
