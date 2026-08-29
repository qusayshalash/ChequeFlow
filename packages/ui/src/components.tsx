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
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  danger: 'bg-red-50 text-red-800 border-red-200',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-medium',
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
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  loading?: boolean;
}

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-teal-800 text-white hover:bg-teal-900 focus-visible:outline-teal-800',
  secondary:
    'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 focus-visible:outline-slate-500',
  ghost: 'bg-transparent text-teal-800 hover:bg-teal-50 focus-visible:outline-teal-800',
  danger: 'bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700',
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
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg font-medium transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'lg' ? 'px-6 text-lg' : 'px-4 text-base',
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
      className={clsx('rounded-xl border border-slate-200 bg-white p-5 shadow-sm', className)}
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
    <div className="flex items-center justify-center gap-3 p-10 text-slate-600">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 p-10 text-center">
      <p className="text-slate-600">{title}</p>
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
      className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-5"
    >
      <p className="font-medium text-red-800">{title}</p>
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
      className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"
    >
      {message}
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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-800">
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
  'min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 ' +
  'focus:border-teal-700 focus:outline-2 focus:outline-offset-1 focus:outline-teal-700 ' +
  'disabled:bg-slate-100 aria-[invalid=true]:border-red-500';
