import clsx from 'clsx';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

import { toneFor, type StatusTone } from './tokens.js';

/**
 * Presentational primitives for the web dashboard.
 *
 * They are styled with Tailwind utility classes and carry no data fetching,
 * which keeps them trivially replaceable and testable.
 */

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
  info: 'border-sky-100 bg-sky-50 text-sky-700',
  success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-100 bg-amber-50 text-amber-700',
  danger: 'border-red-100 bg-red-50 text-red-700',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}

/** A cheque status pill; the label is passed in already translated. */
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge tone={toneFor(status)}>{label}</Badge>;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
}

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'border border-teal-700 bg-teal-700 text-white shadow-sm hover:border-teal-800 hover:bg-teal-800 focus-visible:outline-teal-700',
  secondary:
    'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400',
  outline:
    'border border-teal-200 bg-white text-teal-800 hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-teal-700',
  ghost:
    'border border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-slate-400',
  danger:
    'border border-red-600 bg-red-600 text-white shadow-sm hover:border-red-700 hover:bg-red-700 focus-visible:outline-red-600',
};

const BUTTON_SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'min-h-9 rounded-lg px-3 text-xs',
  md: 'min-h-11 rounded-xl px-4 text-sm',
  lg: 'min-h-12 rounded-xl px-5 text-base',
  icon: 'size-11 rounded-xl p-0',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      // 48px minimum height keeps the target comfortable on touch screens.
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-2 font-semibold transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0',
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      disabled={disabled === true || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={clsx(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        className ?? 'size-5',
      )}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgb(16_24_40/0.035)]',
        className,
      )}
      {...props}
    />
  );
}

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: StatusTone;
}

export function StatCard({ label, value, hint, tone = 'neutral' }: StatCardProps) {
  return (
    <Card className={clsx('flex flex-col gap-1', tone === 'danger' && 'border-red-200')}>
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-slate-900">{value}</span>
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </Card>
  );
}

/** The four UI states every data view must handle. */
export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 p-5">
      <span className="sr-only">{label}</span>
      <span className="app-skeleton h-4 w-32 rounded-md" aria-hidden="true" />
      <span className="app-skeleton h-14 w-full rounded-xl" aria-hidden="true" />
      <span className="app-skeleton h-14 w-full rounded-xl" aria-hidden="true" />
      <span className="app-skeleton h-14 w-4/5 rounded-xl" aria-hidden="true" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M4 7.5h16v12H4z" />
          <path d="M7 4.5h10l2 3H5zM8 12h8" />
        </svg>
      </span>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description ? (
        <p className="max-w-md text-sm leading-6 text-slate-500">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  requestId,
  onRetry,
  retryLabel,
}: {
  title: string;
  requestId?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-2xl border border-red-100 bg-red-50/80 p-5"
    >
      <p className="font-semibold text-red-700">{title}</p>
      {requestId ? <p className="text-xs text-red-700">request-id: {requestId}</p> : null}
      {onRetry && retryLabel ? (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
    >
      <span className="flex size-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
        ✓
      </span>
      <span>{message}</span>
    </div>
  );
}

export interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, required, children }: FieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-700">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-red-700">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? <span className="text-xs text-slate-500">{hint}</span> : null}
      {error ? (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export const inputClassName =
  'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-[0_1px_1px_rgb(16_24_40/0.02)] ' +
  'placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-500 focus:outline-none focus:ring-4 ' +
  'focus:ring-teal-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-red-500/10';
