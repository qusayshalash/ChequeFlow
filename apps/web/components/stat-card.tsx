import type { ComponentType, SVGProps } from 'react';

/**
 * Accents carry meaning, not decoration: red is money that needs chasing,
 * amber is money due soon, teal is money in hand, slate is not yet real.
 */
export type StatTone = 'neutral' | 'teal' | 'amber' | 'red';

const TONES: Record<StatTone, { bar: string; iconBg: string; iconFg: string }> = {
  neutral: { bar: 'bg-slate-300', iconBg: 'bg-slate-100', iconFg: 'text-slate-500' },
  teal: { bar: 'bg-teal-600', iconBg: 'bg-teal-50', iconFg: 'text-teal-700' },
  amber: { bar: 'bg-amber-400', iconBg: 'bg-amber-50', iconFg: 'text-amber-600' },
  red: { bar: 'bg-red-500', iconBg: 'bg-red-50', iconFg: 'text-red-600' },
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
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5">
      {/* The accent runs down the leading edge, which mirrors with the layout. */}
      <span className={`absolute inset-y-0 start-0 w-1 ${palette.bar}`} aria-hidden="true" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">{value}</p>
        </div>
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${palette.iconBg} ${palette.iconFg}`}
        >
          <Icon />
        </span>
      </div>

      {/* Wraps rather than truncates: a hint reading "ILS 9,000 • USD 16,5…"
          cuts a figure in half, which is worse than a second line. */}
      {hint ? (
        <p className="mt-3 text-sm leading-relaxed text-slate-500 tabular-nums">{hint}</p>
      ) : null}
    </div>
  );
}
