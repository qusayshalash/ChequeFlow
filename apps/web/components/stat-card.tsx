import type { ComponentType, SVGProps } from 'react';

/**
 * Accents carry meaning, not decoration: red is money that needs chasing,
 * amber is money due soon, teal is money in hand, slate is not yet real.
 */
export type StatTone = 'neutral' | 'teal' | 'amber' | 'red';

const TONES: Record<StatTone, { dot: string; iconBg: string; iconFg: string; value: string }> = {
  neutral: {
    dot: 'bg-slate-400',
    iconBg: 'bg-slate-50 ring-slate-100',
    iconFg: 'text-slate-500',
    value: 'text-slate-950',
  },
  teal: {
    dot: 'bg-teal-500',
    iconBg: 'bg-teal-50 ring-teal-100',
    iconFg: 'text-teal-700',
    value: 'text-teal-950',
  },
  amber: {
    dot: 'bg-amber-500',
    iconBg: 'bg-amber-50 ring-amber-100',
    iconFg: 'text-amber-700',
    value: 'text-amber-950',
  },
  red: {
    dot: 'bg-red-500',
    iconBg: 'bg-red-50 ring-red-100',
    iconFg: 'text-red-600',
    value: 'text-red-950',
  },
};

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  const palette = TONES[tone];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.035)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_30px_-24px_rgb(16_24_40/0.45)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <span className={`size-1.5 rounded-full ${palette.dot}`} aria-hidden="true" />
            {label}
          </p>
          <p
            className={`mt-2 text-3xl font-bold tracking-[-0.035em] tabular-nums ${palette.value}`}
          >
            {value}
          </p>
        </div>
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ${palette.iconBg} ${palette.iconFg}`}
        >
          <Icon />
        </span>
      </div>

      {/* Wraps rather than truncates: a hint reading "ILS 9,000 • USD 16,5…"
          cuts a figure in half, which is worse than a second line. */}
      {hint ? (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500 tabular-nums">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
