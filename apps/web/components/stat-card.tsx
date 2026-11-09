'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from 'react';

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
  menu,
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
  /**
   * Choices behind the card's "…", which is otherwise a plain mark. Used by
   * the headline card to switch between incoming and outgoing cheques.
   */
  menu?: {
    label: string;
    items: ReadonlyArray<{ key: string; label: string; active: boolean; onSelect: () => void }>;
  };
}) {
  const t = useTranslator();
  const palette = TONES[tone];
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (holder.current && !holder.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
        {menu ? (
          <div ref={holder} className="pointer-events-auto relative z-10 -me-1.5 -mt-1.5 shrink-0">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={menu.label}
              onClick={() => setOpen((value) => !value)}
              className="flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink"
            >
              <IconDots width="16" height="16" />
            </button>
            {open ? (
              <div
                role="menu"
                className="absolute end-0 top-9 z-30 w-40 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-lg"
              >
                {menu.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={item.active}
                    onClick={() => {
                      item.onSelect();
                      setOpen(false);
                    }}
                    className={`block w-full rounded-lg px-3 py-2.5 text-start text-sm hover:bg-subtle ${
                      item.active ? 'font-semibold text-primary-ink' : 'text-ink-soft'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="-me-1 -mt-1 hidden shrink-0 text-ink-faint sm:block" aria-hidden="true">
            <IconDots width="16" height="16" />
          </span>
        )}
      </div>

      {amount ? (
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

  // A menu cannot sit inside a link: clicking it would follow the link. So the
  // link covers the card from behind and the content is laid over it, letting
  // clicks through everywhere except the menu.
  if (menu) {
    return (
      <div
        className={`${shell} relative transition hover:border-line-strong hover:shadow-[0_10px_26px_-20px_rgb(16_24_40/0.45)]`}
      >
        <Link href={href} aria-label={label} className="absolute inset-0 rounded-2xl" />
        <div className="pointer-events-none relative">{body}</div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={`${shell} transition hover:border-line-strong hover:shadow-[0_10px_26px_-20px_rgb(16_24_40/0.45)]`}
    >
      {body}
    </Link>
  );
}
